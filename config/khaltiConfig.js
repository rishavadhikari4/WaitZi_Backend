import dotenv from 'dotenv';
dotenv.config();

const khaltiConfig = {
  gatewayUrl: process.env.KHALTI_GATEWAY_URL || 'https://dev.khalti.com',
  secretKey: process.env.KHALTI_SECRET_KEY,
  returnUrl: process.env.KHALTI_RETURN_URL,
  websiteUrl: process.env.KHALTI_WEBSITE_URL,
};

export default khaltiConfig;
