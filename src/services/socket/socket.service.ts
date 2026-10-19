// src/services/socket/socket.service.ts
// Real-time updates, isolated per organization.
//
// The frontend still asks for rooms by their old names ('kitchen',
// 'dashboard', 'admin-alerts', 'table:<id>', 'order:<id>'); the server maps
// each one onto a room inside the caller's organization:
//   staff (access token in cookie or handshake auth) -> their org's staff rooms
//   anyone  -> 'table:<id>' / 'order:<id>' only if that table/order exists,
//              joined under *its* org, so events never cross tenants.
// The old server let any client join any room name, so anyone could watch
// every order of every table; that is what this replaces.
import type http from 'node:http';

import { Server, type Socket } from 'socket.io';

import config from '../../config/config.js';
import { asPlatform } from '../../config/prisma.js';
import { logger } from '../../utils/logger.js';
import { verifyAccessToken } from '../../utils/tokens.js';

const STAFF_ROOMS = new Set(['kitchen', 'dashboard', 'admin-alerts']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrderEvent =
  | 'order:new'
  | 'order:status-updated'
  | 'order:item-updated'
  | 'order:items-added'
  | 'order:cancelled'
  | 'order:paid'
  | 'order:completed'
  | 'payment:completed'
  | 'table:updated';

const KITCHEN_EVENTS = new Set<OrderEvent>(['order:new', 'order:status-updated', 'order:item-updated', 'order:cancelled', 'order:items-added']);

const room = (orgId: string, name: string) => `org:${orgId}:${name}`;

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Staff org from the access token (handshake auth or cookie), if any. */
function staffOrg(socket: Socket): string | null {
  const token =
    (socket.handshake.auth as { token?: string } | undefined)?.token ??
    readCookie(socket.handshake.headers.cookie, 'accessToken');
  if (!token) return null;
  try {
    const decoded = verifyAccessToken(token);
    return decoded.scope === 'tenant' && decoded.orgId ? decoded.orgId : null;
  } catch {
    return null;
  }
}

/** Org that owns a table or order; null if it doesn't exist. */
async function ownerOf(kind: 'table' | 'order', id: string): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const row = await asPlatform('socket: room owner lookup', (db) =>
    kind === 'table'
      ? db.diningTable.findUnique({ where: { id }, select: { orgId: true } })
      : db.order.findUnique({ where: { id }, select: { orgId: true } }),
  );
  return row?.orgId ?? null;
}

class SocketService {
  private io: Server | undefined;

  init(server: http.Server) {
    this.io = new Server(server, {
      cors: { origin: config.app.corsOrigins, credentials: true },
      pingTimeout: 60_000,
      pingInterval: 25_000,
    });

    this.io.on('connection', (socket) => {
      const orgId = staffOrg(socket);

      socket.on('join', async (requested: unknown) => {
        const names = (Array.isArray(requested) ? requested : [requested]).filter(
          (r): r is string => typeof r === 'string' && r.length < 100,
        );
        for (const name of names) {
          const target = await this.resolve(name, orgId).catch(() => null);
          if (target) await socket.join(target);
        }
      });

      socket.on('leave', async (requested: unknown) => {
        const names = (Array.isArray(requested) ? requested : [requested]).filter((r): r is string => typeof r === 'string');
        for (const name of names) {
          // Leave whatever org-scoped room this name mapped to.
          for (const joined of socket.rooms) if (joined.endsWith(`:${name}`)) await socket.leave(joined);
        }
      });
    });

    logger.info('Socket.IO initialized');
    return this.io;
  }

  private async resolve(name: string, staffOrgId: string | null): Promise<string | null> {
    if (STAFF_ROOMS.has(name)) return staffOrgId ? room(staffOrgId, name) : null;
    const [kind, id] = name.split(':');
    if ((kind === 'table' || kind === 'order') && id) {
      const owner = await ownerOf(kind, id);
      // Staff may only follow their own org's tables/orders.
      if (!owner || (staffOrgId && owner !== staffOrgId)) return null;
      return room(owner, name);
    }
    return null;
  }

  /** Fan an order event out to the org's staff rooms and its table/order rooms. */
  emitOrderEvent(orgId: string, event: OrderEvent, payload: { orderId?: string; tableId?: string | null; order?: unknown }) {
    if (!this.io) return;
    const targets = [room(orgId, 'dashboard'), room(orgId, 'admin-alerts')];
    if (KITCHEN_EVENTS.has(event)) targets.push(room(orgId, 'kitchen'));
    if (payload.tableId) targets.push(room(orgId, `table:${payload.tableId}`));
    if (payload.orderId) targets.push(room(orgId, `order:${payload.orderId}`));
    this.io.to(targets).emit(event, payload);
  }

  async close() {
    await this.io?.close();
    this.io = undefined;
  }
}

export default new SocketService();
