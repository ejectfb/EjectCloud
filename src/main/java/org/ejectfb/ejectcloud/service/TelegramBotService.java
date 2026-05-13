package org.ejectfb.ejectcloud.service;

import com.pengrad.telegrambot.TelegramBot;
import com.pengrad.telegrambot.model.Update;
import com.pengrad.telegrambot.model.request.ParseMode;
import com.pengrad.telegrambot.request.GetMe;
import com.pengrad.telegrambot.request.GetUpdates;
import com.pengrad.telegrambot.request.SendDocument;
import com.pengrad.telegrambot.request.SendMessage;
import com.pengrad.telegrambot.response.GetMeResponse;
import com.pengrad.telegrambot.response.GetUpdatesResponse;
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
import java.security.SecureRandom;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

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
    private volatile Integer updatesOffset = null;
    private volatile String botUsername = "";
    private volatile boolean pollingStarted = false;
    private final SecureRandom secureRandom = new SecureRandom();
    private final ScheduledExecutorService pollingExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "telegram-code-poller");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, PendingTelegramCode> pendingCodes = new ConcurrentHashMap<>();

    private record PendingTelegramCode(String chatId, String username, Instant expiresAt) {}
    
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
                if (response.user() != null && response.user().username() != null) {
                    botUsername = "@" + response.user().username();
                }
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
        boolean success = testConnectionInternal(botToken);
        if (success) startPolling();
        return success;
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

    public String getBotUsername() {
        if (botUsername != null && !botUsername.isBlank()) return botUsername;
        if (!isConfigured()) return "";
        try {
            TelegramBot b = getOrCreateBot();
            if (b == null) return "";
            GetMeResponse response = b.execute(new GetMe());
            if (response.isOk() && response.user() != null && response.user().username() != null) {
                botUsername = "@" + response.user().username();
                return botUsername;
            }
        } catch (Exception e) {
            connectionError = e.getMessage();
            log.warn("getBotUsername error: {}", e.getMessage());
        }
        return "";
    }

    public String consumeVerificationCode(String code) {
        cleanupExpiredCodes();
        if (code == null || !code.matches("\\d{6}")) return null;
        PendingTelegramCode pending = pendingCodes.remove(code);
        if (pending == null || Instant.now().isAfter(pending.expiresAt())) {
            return null;
        }
        sendMessage(pending.chatId(), "Аккаунт Telegram успешно привязан к EjectCloud.");
        return pending.chatId();
    }

    private synchronized void startPolling() {
        if (pollingStarted || !isConfigured()) return;
        pollingStarted = true;
        pollingExecutor.scheduleWithFixedDelay(this::pollCodeUpdates, 0, 3, TimeUnit.SECONDS);
    }

    private void pollCodeUpdates() {
        if (!isConfigured()) return;
        try {
            TelegramBot b = getOrCreateBot();
            if (b == null) return;
            GetUpdates request = new GetUpdates().limit(100).timeout(0);
            if (updatesOffset != null) {
                request.offset(updatesOffset);
            }
            GetUpdatesResponse response = b.execute(request);
            if (!response.isOk()) return;
            for (Update update : response.updates()) {
                updatesOffset = update.updateId() + 1;
                if (update.message() == null || update.message().text() == null || update.message().chat() == null) {
                    continue;
                }
                String text = update.message().text().trim();
                String chatId = String.valueOf(update.message().chat().id());
                if (text.startsWith("/start")) {
                    sendMessage(chatId, "Для привязки Telegram к EjectCloud отправьте команду /code. Код будет действовать 10 минут.");
                } else if (text.startsWith("/code")) {
                    String code = generateCode();
                    String username = update.message().from() != null ? update.message().from().username() : null;
                    pendingCodes.put(code, new PendingTelegramCode(chatId, username, Instant.now().plus(10, ChronoUnit.MINUTES)));
                    sendMessage(chatId, "Ваш код привязки EjectCloud: <code>" + code + "</code>\nКод действует 10 минут.");
                }
            }
            cleanupExpiredCodes();
        } catch (Exception e) {
            connectionError = e.getMessage();
            log.warn("pollCodeUpdates error: {}", e.getMessage());
        }
    }

    private String generateCode() {
        for (int i = 0; i < 10; i++) {
            String code = String.valueOf(100000 + secureRandom.nextInt(900000));
            if (!pendingCodes.containsKey(code)) return code;
        }
        return String.valueOf(100000 + secureRandom.nextInt(900000));
    }

    private void cleanupExpiredCodes() {
        Instant now = Instant.now();
        pendingCodes.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt()));
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
                            "Название: <code>" + FormatUtil.escapeHtml(filename) + "</code>\n" +
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
        if (isConfigured()) {
            testConnection();
        }
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
            String savedBotUsername = props.getProperty("telegram.bot.username", "");
            if (!savedToken.isEmpty()) this.botToken = savedToken;
            if (!savedChatId.isEmpty()) this.adminChatId = savedChatId;
            if (!savedBotUsername.isEmpty()) this.botUsername = savedBotUsername;
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
            props.setProperty("telegram.bot.username", botUsername != null ? botUsername : "");
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
        this.updatesOffset = null;
        this.botUsername = "";
    }

    public String getAdminChatId() {
        return adminChatId;
    }

    public void setAdminChatId(String chatId) {
        this.adminChatId = chatId;
    }
}
