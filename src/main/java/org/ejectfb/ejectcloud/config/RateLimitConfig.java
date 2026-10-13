package org.ejectfb.ejectcloud.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitConfig extends OncePerRequestFilter {
    
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> loginBuckets = new ConcurrentHashMap<>();
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, 
                                  FilterChain filterChain) throws ServletException, IOException {
        
        String uri = request.getRequestURI();
        String clientIp = getClientIP(request);
        
        // Строгое ограничение для логина
        if (uri.equals("/api/auth/login") && "POST".equals(request.getMethod())) {
            Bucket loginBucket = getLoginBucket(clientIp);
            if (!loginBucket.tryConsume(1)) {
                writeError(response, "Слишком много попыток входа",
                        "Повторите попытку через минуту.");
                return;
            }
        }

        // Исключаем API из rate limiting для авторизованных пользователей
        if (uri.startsWith("/api/") && request.getParameter("token") != null) {
            filterChain.doFilter(request, response);
            return;
        }

        Bucket bucket = getBucket(clientIp);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            writeError(response, "Слишком много запросов",
                    "Вы выполняете действия слишком быстро. Подождите минуту и обновите страницу.");
        }
    }

    private void writeError(HttpServletResponse response, String title, String message) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType("text/html; charset=UTF-8");
        response.getWriter().write(
            "<!DOCTYPE html><html lang='ru'><head><meta charset='utf-8'>" +
            "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<title>Слишком много запросов</title>" +
            "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
            "font-family:-apple-system,'Segoe UI',Roboto,Inter,sans-serif;background:#f6f7f8;color:#1c2128;" +
            "-webkit-font-smoothing:antialiased}.box{text-align:center;padding:40px 32px;max-width:420px}" +
            ".code{font-size:52px;font-weight:800;letter-spacing:-2px;margin-bottom:12px}" +
            "h1{font-size:19px;font-weight:700;margin:0 0 8px}p{color:#5c6470;font-size:14.5px;line-height:1.55;margin:0}" +
            "@media(prefers-color-scheme:dark){body{background:#0e1013;color:#eceef1}.code{color:#f5a524}p{color:#9aa3af}}</style></head>" +
            "<body><div class='box'><div class='code'>429</div><h1>" + title + "</h1><p>" + message + "</p></div></body></html>"
        );
    }
    
    private Bucket getBucket(String clientIp) {
        return buckets.computeIfAbsent(clientIp, this::createBucket);
    }
    
    private Bucket getLoginBucket(String clientIp) {
        return loginBuckets.computeIfAbsent(clientIp, this::createLoginBucket);
    }
    
    private Bucket createBucket(String clientIp) {
        // 100 запросов в минуту
        Bandwidth limit = Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1)));
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }
    
    private Bucket createLoginBucket(String clientIp) {
        // 5 попыток логина в минуту
        Bandwidth limit = Bandwidth.classic(5, Refill.intervally(5, Duration.ofMinutes(1)));
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }
    
    private String getClientIP(HttpServletRequest request) {
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader == null) {
            return request.getRemoteAddr();
        }
        return xfHeader.split(",")[0].trim();
    }
}