package org.ejectfb.ejectcloud.model;

public class AuthenticatedUser {
    private final String telegramId;
    private final String userId;
    private final String displayName;
    private final boolean isAdmin;
    private final boolean mustChangePassword;

    public AuthenticatedUser(String telegramId, String userId, String displayName, boolean isAdmin, boolean mustChangePassword) {
        this.telegramId = telegramId;
        this.userId = userId;
        this.displayName = displayName;
        this.isAdmin = isAdmin;
        this.mustChangePassword = mustChangePassword;
    }

    public String getTelegramId() { return telegramId; }
    public String getUserId() { return userId; }
    public String getDisplayName() { return displayName; }
    public boolean isAdmin() { return isAdmin; }
    public boolean isMustChangePassword() { return mustChangePassword; }
}
