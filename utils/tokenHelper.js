import jwt from "jsonwebtoken";

class TokenHelper {
  static generateAccessToken(payload) {
    try {
      const secret = process.env.ACCESS_TOKEN_SECRET;
      if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is not defined in environment variables");
      }
      
      return jwt.sign(payload, secret, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
        issuer: 'waitzi-backend',
        audience: 'waitzi-app'
      });
    } catch (error) {
      throw new Error(`Error generating access token: ${error.message}`);
    }
  }

  static generateRefreshToken(payload) {
    try {
      const secret = process.env.REFRESH_TOKEN_SECRET;
      if (!secret) {
        throw new Error("REFRESH_TOKEN_SECRET is not defined in environment variables");
      }
      
      return jwt.sign(payload, secret, {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
        issuer: 'waitzi-backend',
        audience: 'waitzi-app'
      });
    } catch (error) {
      throw new Error(`Error generating refresh token: ${error.message}`);
    }
  }

  static verifyAccessToken(token) {
    try {
      const secret = process.env.ACCESS_TOKEN_SECRET;
      if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is not defined");
      }
      
      return jwt.verify(token, secret, {
        issuer: 'waitzi-backend',
        audience: 'waitzi-app'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Access token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid access token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Access token not active yet');
      }
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  static verifyRefreshToken(token) {
    try {
      const secret = process.env.REFRESH_TOKEN_SECRET;
      if (!secret) {
        throw new Error("REFRESH_TOKEN_SECRET is not defined");
      }
      
      return jwt.verify(token, secret, {
        issuer: 'waitzi-backend',
        audience: 'waitzi-app'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Refresh token not active yet');
      }
      throw new Error(`Refresh token verification failed: ${error.message}`);
    }
  }

  static decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Token decode failed: ${error.message}`);
    }
  }

  static generateTokenPair(payload) {
    try {
      const tokenPayload = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        iat: Math.floor(Date.now() / 1000)
      };

      const accessToken = this.generateAccessToken(tokenPayload);
      const refreshToken = this.generateRefreshToken({
        userId: payload.userId,
        email: payload.email
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
      };
    } catch (error) {
      throw new Error(`Error generating token pair: ${error.message}`);
    }
  }

  static extractTokenFromHeader(authHeader) {
    try {
      if (!authHeader) {
        throw new Error('Authorization header is missing');
      }

      if (!authHeader.startsWith('Bearer ')) {
        throw new Error('Invalid authorization header format. Use "Bearer <token>"');
      }

      const token = authHeader.substring(7); 
      
      if (!token) {
        throw new Error('Token is missing in authorization header');
      }

      return token;
    } catch (error) {
      throw new Error(`Token extraction failed: ${error.message}`);
    }
  }

  static extractTokenFromCookie(cookies, tokenName = 'accessToken') {
    try {
      if (!cookies || typeof cookies !== 'object') {
        throw new Error('Cookies object is missing or invalid');
      }

      const token = cookies[tokenName];
      
      if (!token) {
        throw new Error(`${tokenName} cookie is missing`);
      }

      return token;
    } catch (error) {
      throw new Error(`Cookie token extraction failed: ${error.message}`);
    }
  }

  static extractToken(req, tokenName = 'accessToken') {
    // First try Authorization header
    const authHeader = req?.headers?.authorization;
    if (authHeader) {
      try {
        return this.extractTokenFromHeader(authHeader);
      } catch (headerError) {
        // If header extraction fails, try cookies
      }
    }

    // Then try cookies
    const cookies = req?.cookies;
    if (cookies) {
      try {
        return this.extractTokenFromCookie(cookies, tokenName);
      } catch (cookieError) {
        // If both fail, throw a comprehensive error
        throw new Error('Access token not found in Authorization header or cookies');
      }
    }

    throw new Error('Access token is required');
  }


  static isTokenNearExpiry(token, bufferMinutes = 5) {
    try {
      const decoded = this.decodeToken(token);
      const expiryTime = decoded.payload.exp * 1000;
      const currentTime = Date.now();
      const bufferTime = bufferMinutes * 60 * 1000;

      return (expiryTime - currentTime) <= bufferTime;
    } catch (error) {
      return true;
    }
  }
}

export default TokenHelper;