#!/usr/bin/env node

/**
 * One-off idempotent seed script: populates categories, menu items, and tables
 * so a fresh database has something to actually order/manage during development.
 * Safe to re-run - upserts by unique key instead of duplicating.
 *
 * Usage: node seed-data.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './config/dbConfig.js';
import Category from './models/Category.js';
import Menu from './models/Menu.js';
import Table from './models/Table.js';

dotenv.config();

const categories = [
  { name: 'Starters', description: 'Small bites to kick things off' },
  { name: 'Momo', description: 'Steamed and fried Nepali dumplings' },
  { name: 'Soups', description: 'Warm soups served fresh' },
  { name: 'Main Course', description: 'Hearty mains and curries' },
  { name: 'Thali Sets', description: 'Complete traditional meal sets' },
  { name: 'Chowmein & Noodles', description: 'Stir-fried noodle dishes' },
  { name: 'Beverages', description: 'Hot and cold drinks' },
  { name: 'Desserts', description: 'Something sweet to finish' },
];

const menuByCategory = {
  Starters: [
    { name: 'Chicken Chilli', price: 320, description: 'Crispy chicken tossed in a spicy chilli sauce' },
    { name: 'Paneer Tikka', price: 280, description: 'Marinated cottage cheese grilled to order' },
    { name: 'Spring Rolls', price: 220, description: 'Crispy vegetable rolls served with dip' },
    { name: 'Chicken Sekuwa', price: 350, description: 'Nepali-style char-grilled skewered chicken' },
  ],
  Momo: [
    { name: 'Chicken Steam Momo', price: 220, description: 'Classic steamed chicken dumplings' },
    { name: 'Buff Steam Momo', price: 200, description: 'Steamed buffalo meat dumplings' },
    { name: 'Veg Momo', price: 180, description: 'Steamed vegetable dumplings' },
    { name: 'Jhol Momo', price: 240, description: 'Momo served in a tangy spiced soup' },
    { name: 'Fried Momo', price: 240, description: 'Pan-fried momo with chilli sauce' },
  ],
  Soups: [
    { name: 'Thukpa', price: 260, description: 'Tibetan-style noodle soup with vegetables and meat' },
    { name: 'Chicken Corn Soup', price: 190, description: 'Classic sweet corn and shredded chicken soup' },
    { name: 'Tomato Soup', price: 150, description: 'Fresh tomato soup with herbs' },
  ],
  'Main Course': [
    { name: 'Chicken Curry', price: 380, description: 'Home-style chicken curry with rice' },
    { name: 'Mutton Curry', price: 450, description: 'Slow-cooked mutton curry with rice' },
    { name: 'Paneer Butter Masala', price: 340, description: 'Cottage cheese in a creamy tomato gravy' },
    { name: 'Dal Bhat Tarkari', price: 300, description: 'Traditional lentils, rice, and seasonal vegetables' },
    { name: 'Aloo Gobi', price: 260, description: 'Potato and cauliflower curry' },
  ],
  'Thali Sets': [
    { name: 'Veg Thali', price: 350, description: 'Rice, dal, two curries, salad, and pickle' },
    { name: 'Non-Veg Thali', price: 480, description: 'Rice, dal, chicken curry, salad, and pickle' },
    { name: 'Newari Khaja Set', price: 420, description: 'Traditional Newari platter with beaten rice and sides' },
  ],
  'Chowmein & Noodles': [
    { name: 'Chicken Chowmein', price: 260, description: 'Stir-fried noodles with chicken and vegetables' },
    { name: 'Veg Chowmein', price: 210, description: 'Stir-fried noodles with mixed vegetables' },
    { name: 'Buff Chowmein', price: 240, description: 'Stir-fried noodles with buffalo meat' },
  ],
  Beverages: [
    { name: 'Masala Tea', price: 60, description: 'Spiced milk tea' },
    { name: 'Black Coffee', price: 90, description: 'Freshly brewed black coffee' },
    { name: 'Lassi', price: 130, description: 'Chilled sweet yogurt drink' },
    { name: 'Fresh Lime Soda', price: 110, description: 'Refreshing lime soda, sweet or salted' },
    { name: 'Mineral Water', price: 40, description: '1L bottled water' },
  ],
  Desserts: [
    { name: 'Gulab Jamun', price: 140, description: 'Warm milk dumplings in sugar syrup' },
    { name: 'Kheer', price: 150, description: 'Traditional rice pudding' },
    { name: 'Juju Dhau', price: 170, description: 'Bhaktapur-style king yogurt' },
  ],
};

const tables = [
  { tableNumber: 1, capacity: 2 },
  { tableNumber: 2, capacity: 2 },
  { tableNumber: 3, capacity: 4 },
  { tableNumber: 4, capacity: 4 },
  { tableNumber: 5, capacity: 4 },
  { tableNumber: 6, capacity: 4 },
  { tableNumber: 7, capacity: 6 },
  { tableNumber: 8, capacity: 6 },
  { tableNumber: 9, capacity: 6 },
  { tableNumber: 10, capacity: 8 },
  { tableNumber: 11, capacity: 2 },
  { tableNumber: 12, capacity: 4 },
];

async function seed() {
  await connectDB();

  const categoryIds = {};
  for (const cat of categories) {
    const doc = await Category.findOneAndUpdate(
      { name: cat.name },
      { $setOnInsert: cat },
      { upsert: true, new: true }
    );
    categoryIds[cat.name] = doc._id;
  }
  console.log(`✅ Categories ready: ${categories.length}`);

  let menuCount = 0;
  for (const [categoryName, items] of Object.entries(menuByCategory)) {
    for (const item of items) {
      await Menu.findOneAndUpdate(
        { name: item.name },
        { $setOnInsert: { ...item, category: categoryIds[categoryName] } },
        { upsert: true, new: true }
      );
      menuCount++;
    }
  }
  console.log(`✅ Menu items ready: ${menuCount}`);

  for (const table of tables) {
    await Table.findOneAndUpdate(
      { tableNumber: table.tableNumber },
      { $setOnInsert: table },
      { upsert: true, new: true }
    );
  }
  console.log(`✅ Tables ready: ${tables.length}`);

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Failed to seed data:', err.message);
  process.exit(1);
});
