#!/usr/bin/env node

/**
 * WaitZi Backend Authentication Debug Tool
 * 
 * This script helps debug authentication issues by testing:
 * 1. Server connectivity
 * 2. Token verification endpoint
 * 3. Profile endpoint access
 * 
 * Usage:
 * node debug-auth.js [access-token] [refresh-token]
 */

import axios from 'axios';
import process from 'process';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

async function debugAuthentication(accessToken = null, refreshToken = null) {
    console.log('🔍 WaitZi Authentication Debug Tool\n');
    console.log(`🌐 Testing against: ${BASE_URL}\n`);

    // Create axios instance with credentials support
    const api = axios.create({
        baseURL: BASE_URL,
        withCredentials: true,
        timeout: 10000,
        headers: {
            'Content-Type': 'application/json',
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        }
    });

    try {
        // Test 1: Basic server connectivity
        console.log('1️⃣ Testing server connectivity...');
        try {
            const response = await api.get('/auth/verify');
            console.log(`   ✅ Server is responding (Status: ${response.status})`);
            
            if (response.data.success) {
                console.log(`   ✅ Token verification successful`);
                console.log(`   👤 User: ${response.data.data.user.firstName} ${response.data.data.user.lastName}`);
                console.log(`   📧 Email: ${response.data.data.user.email}`);
                console.log(`   🎭 Role: ${response.data.data.user.role.name}`);
                console.log(`   ⏰ Token expiring soon: ${response.data.data.isNearExpiry ? 'Yes' : 'No'}`);
            }
        } catch (error) {
            console.log(`   ❌ Server connectivity issue:`);
            if (error.response) {
                console.log(`      Status: ${error.response.status}`);
                console.log(`      Message: ${error.response.data?.message || 'No message'}`);
                if (error.response.data?.debug) {
                    console.log(`      Debug info:`, error.response.data.debug);
                }
            } else if (error.code === 'ECONNREFUSED') {
                console.log(`      ❌ Server is not running or not accessible`);
                console.log(`      💡 Make sure your backend server is running on the correct port`);
                process.exit(1);
            } else {
                console.log(`      Error: ${error.message}`);
            }
        }

        console.log('\n');
        
        // Test 2: Profile endpoint access
        console.log('2️⃣ Testing profile endpoint access...');
        try {
            const response = await api.get('/users/profile');
            console.log(`   ✅ Profile endpoint accessible (Status: ${response.status})`);
            console.log(`   👤 Profile data retrieved successfully`);
            console.log(`   📋 Profile details:`);
            console.log(`      Name: ${response.data.data.firstName} ${response.data.data.lastName}`);
            console.log(`      Email: ${response.data.data.email}`);
            console.log(`      Status: ${response.data.data.status}`);
            console.log(`      Role: ${response.data.data.role.name}`);
        } catch (error) {
            console.log(`   ❌ Profile endpoint access failed:`);
            if (error.response) {
                console.log(`      Status: ${error.response.status}`);
                console.log(`      Message: ${error.response.data?.message || 'No message'}`);
                if (error.response.data?.debug) {
                    console.log(`      Debug info:`, error.response.data.debug);
                }
                
                // Specific error analysis
                if (error.response.status === 401) {
                    console.log(`   🔍 This is the authentication error causing your frontend redirection!`);
                    console.log(`   💡 Possible causes:`);
                    console.log(`      - Access token has expired`);
                    console.log(`      - Refresh token has expired`);
                    console.log(`      - Token not being sent correctly from frontend`);
                    console.log(`      - CORS or cookie configuration issues`);
                }
            } else {
                console.log(`      Error: ${error.message}`);
            }
        }

        console.log('\n');

        // Test 3: Token refresh if refresh token provided
        if (refreshToken) {
            console.log('3️⃣ Testing token refresh...');
            try {
                const response = await api.post('/auth/refresh-token', {
                    refreshToken: refreshToken
                });
                console.log(`   ✅ Token refresh successful (Status: ${response.status})`);
                console.log(`   🔑 New tokens generated`);
                console.log(`      Access Token: ${response.data.data.accessToken.substring(0, 50)}...`);
                console.log(`      Refresh Token: ${response.data.data.refreshToken.substring(0, 50)}...`);
                console.log(`      Expires In: ${response.data.data.expiresIn}`);
            } catch (error) {
                console.log(`   ❌ Token refresh failed:`);
                if (error.response) {
                    console.log(`      Status: ${error.response.status}`);
                    console.log(`      Message: ${error.response.data?.message || 'No message'}`);
                    
                    if (error.response.status === 401) {
                        console.log(`   🔍 Refresh token has expired - user needs to log in again`);
                    }
                } else {
                    console.log(`      Error: ${error.message}`);
                }
            }
        }

        console.log('\n📊 Debug Summary:');
        console.log('================');
        console.log('✅ Use this tool to test your authentication flow');
        console.log('✅ Check server logs for additional error details');
        console.log('✅ If profile endpoint fails with 401, that\'s likely causing your frontend redirect');
        console.log('✅ Test with valid access/refresh tokens to verify the fix');

    } catch (error) {
        console.error('🚨 Unexpected error during debugging:', error.message);
    }
}

// Parse command line arguments
const accessToken = process.argv[2];
const refreshToken = process.argv[3];

if (process.argv.length > 2) {
    console.log(`🔑 Using provided access token: ${accessToken.substring(0, 20)}...`);
    if (refreshToken) {
        console.log(`🔄 Using provided refresh token: ${refreshToken.substring(0, 20)}...`);
    }
}

// Run the debug tool
debugAuthentication(accessToken, refreshToken);