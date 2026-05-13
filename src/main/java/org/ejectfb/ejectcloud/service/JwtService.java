package org.ejectfb.ejectcloud.service;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class JwtService {
    
    private final SecretKey secretKey;
    private final ConcurrentHashMap<String, String> refreshTokens = new ConcurrentHashMap<>();
    
    @Value("${ejectcloud.jwt.access-token-minutes:15}")
    private int accessTokenMinutes;
    
    @Value("${ejectcloud.jwt.refresh-token-days:30}")
    private int refreshTokenDays;
    
    public JwtService() {
        this.secretKey = Keys.secretKeyFor(SignatureAlgorithm.HS256);
    }
    
    public String generateAccessToken(String userId) {
        return Jwts.builder()
                .setSubject(userId)
                .setIssuedAt(new Date())
                .setExpiration(Date.from(Instant.now().plus(accessTokenMinutes, ChronoUnit.MINUTES)))
                .signWith(secretKey)
                .compact();
    }
    
    public String generateRefreshToken(String userId) {
        String refreshToken = Jwts.builder()
                .setSubject(userId)
                .setIssuedAt(new Date())
                .setExpiration(Date.from(Instant.now().plus(refreshTokenDays, ChronoUnit.DAYS)))
                .signWith(secretKey)
                .compact();
        
        refreshTokens.put(refreshToken, userId);
        return refreshToken;
    }
    
    public String validateAccessToken(String token) {
        try {
            Claims claims = Jwts.parserBuilder()
                    .setSigningKey(secretKey)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
            return claims.getSubject();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
    
    public String validateRefreshToken(String refreshToken) {
        try {
            Claims claims = Jwts.parserBuilder()
                    .setSigningKey(secretKey)
                    .build()
                    .parseClaimsJws(refreshToken)
                    .getBody();
            
            String userId = claims.getSubject();
            if (refreshTokens.containsKey(refreshToken) && refreshTokens.get(refreshToken).equals(userId)) {
                return userId;
            }
        } catch (JwtException | IllegalArgumentException e) {
            // Token invalid
        }
        return null;
    }
    
    public void revokeRefreshToken(String refreshToken) {
        refreshTokens.remove(refreshToken);
    }
    
    public void revokeAllUserTokens(String userId) {
        refreshTokens.entrySet().removeIf(entry -> entry.getValue().equals(userId));
    }
    
    public void cleanupExpiredTokens() {
        refreshTokens.entrySet().removeIf(entry -> {
            try {
                Jwts.parserBuilder()
                        .setSigningKey(secretKey)
                        .build()
                        .parseClaimsJws(entry.getKey());
                return false;
            } catch (JwtException | IllegalArgumentException e) {
                return true;
            }
        });
    }
}
