// src/services/ordering/public/orderingPage.service.ts
// What a guest sees after scanning a table QR: the table, the restaurant and
// its orderable menu. Guests have no account, so the table identifier is the
// only thing that tells us which organization they're at.
import config from '../../../config/config.js';
import { asPlatform, withTenant } from '../../../config/prisma.js';
import DiningTableRepository from '../../../repository/diningTable.repository.js';
import MenuItemRepository from '../../../repository/menuItem.repository.js';
import OrganizationRepository from '../../../repository/organization.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { menuItemToApi, categoryToApi } from '../../menu/shared/menu.mapper.js';
import { isAvailableForOrder, tableToApi } from '../../table/shared/table.mapper.js';
import { inOrder } from '../../../utils/Helpers.js';

export type TableLocator =
  | { kind: 'qrToken'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'number'; value: number; orgSlug?: string | undefined };

const MONGO_ID = /^[0-9a-f]{24}$/i;
const notFound = () => AppError.notFound('Table not found');

/** Platform lookup that returns only ids; all real reads happen in withTenant. */
async function locate(loc: TableLocator): Promise<{ id: string; orgId: string }> {
  const found = await asPlatform('public: locate table', async (db) => {
    switch (loc.kind) {
      case 'qrToken':
        return DiningTableRepository.findOrgByQrToken(db, loc.value);
      case 'id':
        // Printed stickers from before the Postgres move carry the Mongo _id.
        return MONGO_ID.test(loc.value)
          ? DiningTableRepository.findOrgByLegacyId(db, loc.value.toLowerCase())
          : DiningTableRepository.findOrgById(db, loc.value);
      case 'number': {
        const slug = loc.orgSlug ?? config.app.defaultOrgSlug;
        if (!slug) return null;
        const org = await OrganizationRepository.findBySlug(db, slug);
        return org ? DiningTableRepository.findOrgByNumber(db, org.id, loc.value) : null;
      }
      default:
        return null;
    }
  });
  if (!found) throw notFound();
  return found;
}

class PublicOrderingService {
  getOrderingPage = async (loc: TableLocator) => {
    const { id, orgId } = await locate(loc);

    return withTenant({ orgId }, async (tx) => {
      const [table, org, categories] = await inOrder(
        () => DiningTableRepository.findById(tx, id),
        () => OrganizationRepository.findCurrent(tx, orgId),
        () => MenuItemRepository.orderableMenu(tx),
      );
      if (!table || !org || org.status === 'suspended') throw notFound();

      const { assignedWaiter, ...publicTable } = tableToApi(table);
      return {
        table: {
          ...publicTable,
          // Guests see who is serving them, not the staff member's email.
          assignedWaiter: assignedWaiter ? { firstName: assignedWaiter.firstName, lastName: assignedWaiter.lastName } : null,
          isAvailableForOrder: isAvailableForOrder(table),
        },
        menu: categories.map(({ menuItems, ...category }) => ({
          ...categoryToApi(category),
          items: menuItems.map(menuItemToApi),
        })),
        restaurant: {
          name: org.name,
          slug: org.slug,
          branding: org.branding,
          welcomeMessage: 'Welcome! Browse the menu and place your order from your phone.',
        },
      };
    });
  };
}

export default new PublicOrderingService();
