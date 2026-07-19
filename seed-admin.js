#!/usr/bin/env node

/**
 * One-off bootstrap script: creates the first admin user.
 * Needed because POST /api/auth/register itself requires an existing admin token,
 * so there's no way to create the first admin through the API.
 *
 * Usage:
 *   node seed-admin.js <email> <password> <firstName> <lastName> <phoneNumber>
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import connectDB from './config/dbConfig.js';
import Role from './models/Role.js';
import User from './models/User.js';
import { initializeAdminRole } from './controller/roleController.js';

dotenv.config();

const [, , email, password, firstName, lastName, number] = process.argv;

if (!email || !password || !firstName || !lastName || !number) {
  console.log('Usage: node seed-admin.js <email> <password> <firstName> <lastName> <phoneNumber>');
  process.exit(1);
}

async function seedAdmin() {
  await connectDB();
  await initializeAdminRole();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`❌ User with email ${email} already exists.`);
    process.exit(1);
  }

  const adminRole = await Role.findOne({ name: 'admin' });
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
    number,
    address: 'N/A',
    role: adminRole._id,
    status: 'Active',
  });

  console.log(`✅ Admin user created: ${user.email}`);
  await mongoose.connection.close();
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Failed to seed admin:', err.message);
  process.exit(1);
});
