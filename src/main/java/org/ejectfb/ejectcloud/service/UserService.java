package org.ejectfb.ejectcloud.service;

import org.ejectfb.ejectcloud.model.UserData;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;
import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class UserService {
    
    @Value("${ejectcloud.data-dir:./Data}")
    private String baseDir;
    
    @Value("${ejectcloud.default.quota:1073741824}")
    private long defaultQuota;
    
    private final PasswordService passwordService;
    
    public UserService(PasswordService passwordService) {
        this.passwordService = passwordService;
    }
    
    public void initializeDefaultAdmin() {
        try {
            Path dataPath = Paths.get(baseDir);
            if (!Files.exists(dataPath) || isEmpty(dataPath)) {
                Files.createDirectories(dataPath);
                createUser("admin@admin.admin", "admin", "Administrator", "admin_tg", true);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialize default admin", e);
        }
    }
    
    private boolean isEmpty(Path path) throws IOException {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(path)) {
            return !stream.iterator().hasNext();
        }
    }
    
    public UserData authenticate(String email, String password) {
        UserData user = findUserByEmail(email);
        if (user != null && passwordService.verifyPassword(password, user.getPasswordHash(), user.getSalt())) {
            return user;
        }
        return null;
    }
    
    public UserData findUserByEmail(String email) {
        try (DirectoryStream<Path> dirs = Files.newDirectoryStream(Paths.get(baseDir))) {
            for (Path userDir : dirs) {
                if (Files.isDirectory(userDir)) {
                    UserData userData = loadUserData(userDir.getFileName().toString());
                    if (userData != null && email.equals(userData.getEmail())) {
                        return userData;
                    }
                }
            }
        } catch (IOException e) {
            // ignore
        }
        return null;
    }
    
    public UserData findUserByTelegramId(String telegramId) {
        try (DirectoryStream<Path> dirs = Files.newDirectoryStream(Paths.get(baseDir))) {
            for (Path userDir : dirs) {
                if (Files.isDirectory(userDir)) {
                    UserData userData = loadUserData(userDir.getFileName().toString());
                    if (userData != null && telegramId.equals(userData.getTelegramId())) {
                        return userData;
                    }
                }
            }
        } catch (IOException e) {
            // ignore
        }
        return null;
    }

    public UserData findUserById(String userId) {
        if (!Files.exists(Paths.get(baseDir, userId, "user.xml"))) {
            return null;
        }
        return loadUserData(userId);
    }
    
    public UserData createUser(String email, String password, String displayName, String telegramId, boolean isAdmin) {
        return createUser(email, password, displayName, telegramId, isAdmin, generateUserId(displayName));
    }

    public UserData createUser(String email, String password, String displayName, String telegramId, boolean isAdmin, String nickname) {
        String userId = normalizeNickname(nickname);
        if (Files.exists(Paths.get(baseDir, userId))) {
            throw new IllegalArgumentException("Nickname уже занят");
        }
        String salt = passwordService.generateSalt();
        String passwordHash = passwordService.hashPassword(password, salt);
        
        UserData userData = new UserData();
        userData.setId(userId);
        userData.setEmail(email);
        userData.setDisplayName(displayName);
        userData.setNickname(userId);
        userData.setTelegramId(telegramId);
        userData.setTelegramVerified(false);
        userData.setPasswordHash(passwordHash);
        userData.setSalt(salt);
        userData.setQuotaBytes(defaultQuota);
        userData.setCreatedAt(Instant.now().toString());
        userData.setAdmin(isAdmin);
        userData.setMustChangePassword(password.equals(email)); // Must change if password equals email
        
        saveUserData(userId, userData);
        return userData;
    }
    
    public void updatePassword(String userId, String newPassword) {
        UserData userData = loadUserData(userId);
        if (userData != null) {
            String salt = passwordService.generateSalt();
            String passwordHash = passwordService.hashPassword(newPassword, salt);
            userData.setPasswordHash(passwordHash);
            userData.setSalt(salt);
            userData.setMustChangePassword(false);
            saveUserData(userId, userData);
        }
    }
    
    public void resetPassword(String userId) {
        UserData userData = loadUserData(userId);
        if (userData != null) {
            String salt = passwordService.generateSalt();
            String passwordHash = passwordService.hashPassword(userData.getEmail(), salt);
            userData.setPasswordHash(passwordHash);
            userData.setSalt(salt);
            userData.setMustChangePassword(true);
            saveUserData(userId, userData);
        }
    }
    
    public void updateProfile(String userId, String email, String displayName) {
        UserData userData = loadUserData(userId);
        if (userData != null) {
            userData.setEmail(email);
            userData.setDisplayName(displayName);
            saveUserData(userId, userData);
        }
    }

    public void updateTelegram(String userId, String telegramId, boolean verified) {
        UserData userData = loadUserData(userId);
        if (userData != null) {
            if (!telegramId.equals(userData.getTelegramId())) {
                userData.setTelegramVerified(false);
            }
            userData.setTelegramId(telegramId);
            userData.setTelegramVerified(verified);
            saveUserData(userId, userData);
        }
    }

    public void unlinkTelegram(String userId) {
        updateTelegram(userId, "", false);
    }
    
    public void updateUser(String userId, String email, String displayName, String telegramId, long quotaBytes) {
        updateUser(userId, email, displayName, telegramId, quotaBytes, userId);
    }

    public void updateUser(String userId, String email, String displayName, String telegramId, long quotaBytes, String nickname) {
        UserData userData = loadUserData(userId);
        if (userData != null) {
            String newUserId = normalizeNickname(nickname);
            if (!userId.equals(newUserId)) {
                Path oldDir = Paths.get(baseDir, userId);
                Path newDir = Paths.get(baseDir, newUserId);
                if (Files.exists(newDir)) {
                    throw new IllegalArgumentException("Nickname уже занят");
                }
                try {
                    Files.move(oldDir, newDir);
                    userData.setId(newUserId);
                    userId = newUserId;
                } catch (IOException e) {
                    throw new RuntimeException("Failed to rename user directory", e);
                }
            }
            
            userData.setEmail(email);
            userData.setDisplayName(displayName);
            userData.setNickname(userId);
            if (!telegramId.equals(userData.getTelegramId())) {
                userData.setTelegramVerified(false);
            }
            userData.setTelegramId(telegramId);
            userData.setQuotaBytes(quotaBytes);
            saveUserData(userId, userData);
        }
    }
    
    public List<UserData> getAllUsers() {
        List<UserData> users = new ArrayList<>();
        try (DirectoryStream<Path> dirs = Files.newDirectoryStream(Paths.get(baseDir))) {
            for (Path userDir : dirs) {
                if (Files.isDirectory(userDir)) {
                    UserData userData = loadUserData(userDir.getFileName().toString());
                    if (userData != null) {
                        users.add(userData);
                    }
                }
            }
        } catch (IOException e) {
            // ignore
        }
        return users;
    }
    
    public void deleteUser(String userId) {
        try {
            Path userDir = Paths.get(baseDir, userId);
            if (Files.exists(userDir)) {
                Files.walk(userDir)
                    .sorted((a, b) -> b.compareTo(a))
                    .forEach(path -> {
                        try {
                            Files.delete(path);
                        } catch (IOException e) {
                            // ignore
                        }
                    });
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to delete user", e);
        }
    }
    
    private String generateUserId(String displayName) {
        String base = displayName.toLowerCase().replaceAll("[^a-z0-9]", "");
        if (base.isEmpty()) base = "user";
        
        String userId = base;
        int counter = 1;
        while (Files.exists(Paths.get(baseDir, userId))) {
            userId = base + counter++;
        }
        return userId;
    }

    private String normalizeNickname(String nickname) {
        String normalized = nickname == null ? "" : nickname.trim().toLowerCase();
        if (!normalized.matches("[a-z0-9_-]{1,40}")) {
            throw new IllegalArgumentException("Nickname может содержать только латинские буквы, цифры, _ и -");
        }
        return normalized;
    }
    
    private Path getUserDir(String userId) {
        Path dir = Paths.get(baseDir, userId);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new RuntimeException("Cannot create user directory", e);
        }
        return dir;
    }
    
    public UserData loadUserData(String userId) {
        Path userFile = getUserDir(userId).resolve("user.xml");
        if (!Files.exists(userFile)) {
            return null;
        }
        
        try {
            JAXBContext context = JAXBContext.newInstance(UserData.class);
            Unmarshaller unmarshaller = context.createUnmarshaller();
            UserData userData = (UserData) unmarshaller.unmarshal(userFile.toFile());
            if (userData.getNickname() == null || userData.getNickname().isBlank()) {
                userData.setNickname(userId);
            }
            return userData;
        } catch (Exception e) {
            throw new RuntimeException("Cannot load user data", e);
        }
    }
    
    public void saveUserData(String userId, UserData userData) {
        Path userFile = getUserDir(userId).resolve("user.xml");
        try {
            JAXBContext context = JAXBContext.newInstance(UserData.class);
            Marshaller marshaller = context.createMarshaller();
            marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);
            marshaller.marshal(userData, userFile.toFile());
        } catch (Exception e) {
            throw new RuntimeException("Cannot save user data", e);
        }
    }
}
