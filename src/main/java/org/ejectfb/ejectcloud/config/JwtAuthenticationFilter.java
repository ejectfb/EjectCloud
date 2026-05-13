package org.ejectfb.ejectcloud.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.ejectfb.ejectcloud.model.AuthenticatedUser;
import org.ejectfb.ejectcloud.model.UserData;
import org.ejectfb.ejectcloud.service.JwtService;
import org.ejectfb.ejectcloud.service.UserService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.IOException;
import java.util.List;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final JwtService jwtService;
    private final UserService userService;

    public JwtAuthenticationFilter(JwtService jwtService, UserService userService) {
        this.jwtService = jwtService;
        this.userService = userService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        try {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ") && header.length() > 7) {
                String token = header.substring(7);
                String telegramId = jwtService.validateAccessToken(token);
                if (telegramId != null) {
                    UserData user = userService.findUserByTelegramId(telegramId);
                    if (user != null) {
                        AuthenticatedUser principal = new AuthenticatedUser(
                            telegramId, user.getId(), user.getDisplayName(),
                            user.isAdmin(), user.isMustChangePassword());
                        UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(principal, null,
                                List.of(new SimpleGrantedAuthority(user.isAdmin() ? "ROLE_ADMIN" : "ROLE_USER")));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("JWT auth filter error: {}", e.getMessage());
        }
        chain.doFilter(request, response);
    }
}
