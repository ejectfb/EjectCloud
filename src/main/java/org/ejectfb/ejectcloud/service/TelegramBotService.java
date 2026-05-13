package org.ejectfb.ejectcloud.service;

import com.pengrad.telegrambot.TelegramBot;
import com.pengrad.telegrambot.model.request.ParseMode;
import com.pengrad.telegrambot.request.GetMe;
import com.pengrad.telegrambot.request.SendDocument;
import com.pengrad.telegrambot.request.SendMessage;
import com.pengrad.telegrambot.response.GetMeResponse;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.ejectfb.ejectcloud.util.FormatUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;
import java.nio.file.Files;
import java.nio.file.Path;

@Service
public class TelegramBotService {
    private static final Logger log = LoggerFactory.getLogger(TelegramBotService.class);
    private static final String TELEGRAM_CONFIG_FILE = "telegram.properties";

    @Value("${telegram.bot.token:}")
    private String botToken;

    @Value("${telegram.admin.chatid:}")
    private String adminChatId;

    @Value("${ejectcloud.data-dir:./Data}")
    private String dataDir;

    private volatile TelegramBot bot;
    private volatile boolean isConnected = false;
    private volatile String connectionError = null;
    
    public boolean isConfigured() {
        return botToken != null && !botToken.isEmpty();
    }
    
    private boolean testConnectionInternal(String token) {
        if (token == null || token.isEmpty()) {
            isConnected = false;
            connectionError = "Telegram token not configured";
            return false;
        }
        try {
            TelegramBot testBot = new TelegramBot(token);
            GetMeResponse response = testBot.execute(new GetMe());
            if (response.isOk()) {
                isConnected = true;
                connectionError = null;
                return true;
            } else {
                isConnected = false;
                connectionError = "Invalid token or API error";
                log.warn("Telegram testConnection failed");
                return false;
            }
        } catch (Exception e) {
            isConnected = false;
            connectionError = e.getMessage();
            log.warn("Telegram testConnection error: {}", e.getMessage());
            return false;
        }
    }

    public boolean testConnection() {
        return testConnectionInternal(botToken);
    }

    public boolean testConnection(String token) {
        return testConnectionInternal(token);
    }
    
    private TelegramBot getOrCreateBot() {
        if (bot == null && isConfigured()) {
            bot = new TelegramBot(botToken);
        }
        return bot;
    }

    public boolean sendMessage(String chatId, String text) {
        if (!isConfigured()) return false;
        try {
            TelegramBot b = getOrCreateBot();
            if (b == null) return false;
            return b.execute(new SendMessage(chatId, text).parseMode(ParseMode.HTML)).isOk();
        } catch (Exception e) {
            log.warn("sendMessage error: {}", e.getMessage());
            return false;
        }
    }
    
    public boolean sendFile(String chatId, String fileId, String filename, long fileSize) {
        if (!isConfigured()) return false;
        try {
            String caption = "<b>Файл в хранилище:</b>\n" +
                            "Filename: <code>" + FormatUtil.escapeHtml(filename) + "</code>\n" +
                            "Size: " + FormatUtil.formatFileSize(fileSize);
            TelegramBot b = getOrCreateBot();
            if (b == null) return false;
            return b.execute(new SendDocument(chatId, fileId)
                .caption(caption).parseMode(ParseMode.HTML)).isOk();
        } catch (Exception e) {
            log.warn("sendFile error: {}", e.getMessage());
            return false;
        }
    }

    public boolean sendFileFromPath(String chatId, String filePath, String filename, long fileSize) {
        if (!isConfigured()) return false;
        try {
            File file = new File(filePath);
            if (!file.exists()) {
                connectionError = "File not found: " + filePath;
                log.warn("sendFileFromPath: file not found: {}", filePath);
                return false;
            }
            String caption = "<b>Файл в хранилище EjectCloud:</b>\n" +
                            "Пользователь: <code>" + FormatUtil.escapeHtml(filename) + "</code>\n" +
                            "Размер: " + FormatUtil.formatFileSize(fileSize);
            TelegramBot b = getOrCreateBot();
            if (b == null) return false;
            return b.execute(new SendDocument(chatId, file)
                .caption(caption).parseMode(ParseMode.HTML)).isOk();
        } catch (Exception e) {
            connectionError = e.getMessage();
            log.warn("sendFileFromPath error: {}", e.getMessage());
            return false;
        }
    }

    @PostConstruct
    public void init() {
        loadConfigFromFile();
    }

    private Path getConfigPath() {
        return Path.of(dataDir, TELEGRAM_CONFIG_FILE);
    }

    private void loadConfigFromFile() {
        Path configPath = getConfigPath();
        if (!Files.exists(configPath)) return;

        try (InputStream in = Files.newInputStream(configPath)) {
            Properties props = new Properties();
            props.load(in);
            String savedToken = props.getProperty("telegram.bot.token", "");
            String savedChatId = props.getProperty("telegram.admin.chatid", "");
            if (!savedToken.isEmpty()) this.botToken = savedToken;
            if (!savedChatId.isEmpty()) this.adminChatId = savedChatId;
        } catch (IOException e) {
            log.warn("Failed to load telegram config: {}", e.getMessage());
        }
    }

    public void saveConfig() {
        Path configPath = getConfigPath();
        try {
            Files.createDirectories(configPath.getParent());
            Properties props = new Properties();
            props.setProperty("telegram.bot.token", botToken != null ? botToken : "");
            props.setProperty("telegram.admin.chatid", adminChatId != null ? adminChatId : "");
            try (OutputStream out = Files.newOutputStream(configPath)) {
                props.store(out, "Telegram Bot Configuration");
            }
        } catch (IOException e) {
            log.warn("Failed to save telegram config: {}", e.getMessage());
        }
    }

    public boolean isConnected() {
        return isConnected;
    }

    public String getConnectionError() {
        return connectionError;
    }

    public void setBotToken(String token) {
        this.botToken = token;
        this.bot = null;
    }

    public String getAdminChatId() {
        return adminChatId;
    }

    public void setAdminChatId(String chatId) {
        this.adminChatId = chatId;
    }
}
