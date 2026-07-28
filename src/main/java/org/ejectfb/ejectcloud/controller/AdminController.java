package org.ejectfb.ejectcloud.controller;

import org.ejectfb.ejectcloud.model.AuthenticatedUser;
import org.ejectfb.ejectcloud.model.UserData;
import org.ejectfb.ejectcloud.service.FileStorageService;
import org.ejectfb.ejectcloud.service.JwtService;
import org.ejectfb.ejectcloud.service.TelegramBotService;
import org.ejectfb.ejectcloud.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/admin/api")
public class AdminController {

    private final UserService userService;
    private final JwtService jwtService;
    private final FileStorageService storageService;
    private final TelegramBotService telegramBotService;

    public AdminController(UserService userService, JwtService jwtService,
                          FileStorageService storageService,
                          TelegramBotService telegramBotService) {
        this.userService = userService;
        this.jwtService = jwtService;
        this.storageService = storageService;
        this.telegramBotService = telegramBotService;
    }

    private AuthenticatedUser getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthenticatedUser user) {
            return user;
        }
        return null;
    }

    @GetMapping("/users")
    public ResponseEntity<?> listUsers() {
        List<Map<String, Object>> users = new ArrayList<>();
        for (UserData user : userService.getAllUsers()) {
            Map<String, Object> userMap = new HashMap<>();
            long usedBytes = storageService.calculateUsedBytes(user.getId());
            userMap.put("id", user.getId());
            userMap.put("nickname", user.getNickname());
            userMap.put("email", user.getEmail());
            userMap.put("displayName", user.getDisplayName());
            userMap.put("telegramId", user.getTelegramId());
            userMap.put("quotaBytes", user.getQuotaBytes());
            userMap.put("usedBytes", usedBytes);
            userMap.put("usagePercent", user.getQuotaBytes() > 0 ? (double) usedBytes / user.getQuotaBytes() * 100 : 0);
            userMap.put("createdAt", user.getCreatedAt());
            userMap.put("isAdmin", user.isAdmin());
            users.add(userMap);
        }
        return ResponseEntity.ok(users);
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestParam String email,
                                        @RequestParam String nickname,
                                        @RequestParam String displayName,
                                        @RequestParam(defaultValue = "") String telegramId,
                                        @RequestParam(required = false) Long quotaBytes) {
        if (userService.findUserByEmail(email) != null) {
            return ResponseEntity.badRequest().body(Map.of("error", "User already exists"));
        }
        try {
            long quota = quotaBytes != null ? quotaBytes : 1073741824L;
            UserData userData = userService.createUser(email, email, displayName, telegramId, false, nickname);
            userData.setQuotaBytes(quota);
            userService.saveUserData(userData.getId(), userData);
            return ResponseEntity.ok(userData);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/quota")
    public ResponseEntity<?> updateQuota(@RequestParam String userId,
                                         @RequestParam long quotaBytes) {
        UserData userData = userService.loadUserData(userId);
        if (userData != null) {
            userData.setQuotaBytes(quotaBytes);
            userService.saveUserData(userId, userData);
            return ResponseEntity.ok(Map.of("success", true));
        }
        return ResponseEntity.badRequest().body(Map.of("error", "User not found"));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestParam String userId) {
        userService.resetPassword(userId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/users/edit")
    public ResponseEntity<?> editUser(@RequestParam String userId,
                                      @RequestParam String nickname,
                                      @RequestParam String email,
                                      @RequestParam String displayName,
                                      @RequestParam(defaultValue = "") String telegramId,
                                      @RequestParam long quotaBytes) {
        try {
            userService.updateUser(userId, email, displayName, telegramId, quotaBytes, nickname);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/users/delete")
    public ResponseEntity<?> deleteUser(@RequestParam String userId) {
        userService.deleteUser(userId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/dashboard")
    public ResponseEntity<?> getDashboard() {
        Map<String, Object> dashboard = new HashMap<>();
        List<UserData> users = userService.getAllUsers();
        long totalUsed = users.stream().mapToLong(u -> storageService.calculateUsedBytes(u.getId())).sum();
        long totalQuota = users.stream().mapToLong(UserData::getQuotaBytes).sum();
        List<Map<String, Object>> usersList = new ArrayList<>();
        for (UserData user : users) {
            Map<String, Object> userMap = new HashMap<>();
            long usedBytes = storageService.calculateUsedBytes(user.getId());
            userMap.put("username", user.getDisplayName());
            userMap.put("nickname", user.getNickname());
            userMap.put("usedBytes", usedBytes);
            userMap.put("quotaBytes", user.getQuotaBytes());
            usersList.add(userMap);
        }
        dashboard.put("users", Map.of(
            "count", users.size(),
            "totalUsed", totalUsed,
            "totalQuota", totalQuota,
            "list", usersList
        ));
        return ResponseEntity.ok(dashboard);
    }

    @GetMapping("/telegram/status")
    public ResponseEntity<?> getTelegramStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("configured", telegramBotService.isConfigured());
        status.put("connected", telegramBotService.isConnected());
        status.put("connectionError", telegramBotService.getConnectionError());
        status.put("botUsername", telegramBotService.getBotUsername());
        return ResponseEntity.ok(status);
    }

    @PostMapping("/telegram/test")
    public ResponseEntity<?> testTelegramConnection(@RequestParam String botToken,
                                                     @RequestParam String adminChatId) {
        if (botToken == null || botToken.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Bot token is required"));
        }
        if (adminChatId == null || adminChatId.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Admin Chat ID is required"));
        }
        boolean success = telegramBotService.testConnection(botToken);
        Map<String, Object> result = new HashMap<>();
        result.put("success", success);
        if (success) {
            telegramBotService.setBotToken(botToken);
            telegramBotService.setAdminChatId(adminChatId);
            telegramBotService.testConnection();
            telegramBotService.saveConfig();
            result.put("botUsername", telegramBotService.getBotUsername());
            result.put("message", "Бот подключен, проверен и сохранен");
            String testMessage = "<b>EjectCloud:</b>\nБот успешно подключен и сохранен";
            telegramBotService.sendMessage(adminChatId, testMessage);
        } else {
            result.put("error", telegramBotService.getConnectionError());
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/telegram/save")
    public ResponseEntity<?> saveTelegramConfig(@RequestParam String botToken,
                                                 @RequestParam String adminChatId) {
        if (botToken == null || botToken.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Bot token is required"));
        }
        if (adminChatId == null || adminChatId.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Admin Chat ID is required"));
        }
        telegramBotService.setBotToken(botToken);
        telegramBotService.setAdminChatId(adminChatId);
        boolean success = telegramBotService.testConnection();
        if (success) {
            telegramBotService.saveConfig();
        }
        Map<String, Object> result = new HashMap<>();
        result.put("success", success);
        if (success) {
            result.put("message", "Настройки сохранены и бот подключен");
            String testMessage = "<b>EjectCloud:</b>\nНастройки Telegram сохранены";
            telegramBotService.sendMessage(adminChatId, testMessage);
        } else {
            result.put("error", telegramBotService.getConnectionError());
        }
        return ResponseEntity.ok(result);
    }
}
