package pl.naris.nagroda.data;

import pl.naris.nagroda.NagrodaPlugin;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class MySQLManager {

    private final NagrodaPlugin plugin;
    private Connection connection;

    public MySQLManager(NagrodaPlugin plugin) {
        this.plugin = plugin;
    }

    public boolean connect() {
        try {
            String host = plugin.getConfig().getString("mysql.host");
            int port = plugin.getConfig().getInt("mysql.port", 3306);
            String database = plugin.getConfig().getString("mysql.database");
            String username = plugin.getConfig().getString("mysql.username");
            String password = plugin.getConfig().getString("mysql.password");

            String url = "jdbc:mysql://" + host + ":" + port + "/" + database
                    + "?useSSL=false&allowPublicKeyRetrieval=true&autoReconnect=true";

            connection = DriverManager.getConnection(url, username, password);

            // Create table for per-server claim tracking
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS rewards_claimed (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        player_name VARCHAR(16) NOT NULL,
                        server_id VARCHAR(32) NOT NULL,
                        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_claim (player_name, server_id)
                    )
                """);
            }

            plugin.getLogger().info("MySQL: " + host + ":" + port + "/" + database);
            return true;
        } catch (SQLException e) {
            plugin.getLogger().severe("MySQL błąd: " + e.getMessage());
            return false;
        }
    }

    private void ensureConnection() {
        try {
            if (connection == null || connection.isClosed() || !connection.isValid(3)) {
                plugin.getLogger().info("Ponowne łączenie z MySQL...");
                connect();
            }
        } catch (SQLException e) {
            connect();
        }
    }

    /**
     * Get pending rewards that THIS server hasn't given yet
     */
    public List<PendingReward> getPendingRewards(String serverId) {
        ensureConnection();
        List<PendingReward> rewards = new ArrayList<>();

        // Get players from rewards_pending who haven't been claimed by THIS server
        String sql = """
            SELECT rp.player_name, rp.discord_id, rp.discord_tag
            FROM rewards_pending rp
            WHERE NOT EXISTS (
                SELECT 1 FROM rewards_claimed rc
                WHERE rc.player_name = rp.player_name AND rc.server_id = ?
            )
        """;

        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, serverId);
            ResultSet rs = stmt.executeQuery();
            while (rs.next()) {
                rewards.add(new PendingReward(
                        rs.getString("player_name"),
                        rs.getString("discord_id"),
                        rs.getString("discord_tag")
                ));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Błąd pobierania nagród: " + e.getMessage());
        }

        return rewards;
    }

    /**
     * Mark reward as claimed on THIS server
     */
    public void markClaimed(String playerName, String serverId) {
        ensureConnection();
        String sql = "INSERT IGNORE INTO rewards_claimed (player_name, server_id) VALUES (?, ?)";

        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, playerName.toLowerCase());
            stmt.setString(2, serverId);
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Błąd oznaczania nagrody: " + e.getMessage());
        }
    }

    public void close() {
        try {
            if (connection != null && !connection.isClosed()) {
                connection.close();
                plugin.getLogger().info("Zamknięto MySQL.");
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Błąd zamykania MySQL: " + e.getMessage());
        }
    }

    public static class PendingReward {
        public final String playerName;
        public final String discordId;
        public final String discordTag;

        public PendingReward(String playerName, String discordId, String discordTag) {
            this.playerName = playerName;
            this.discordId = discordId;
            this.discordTag = discordTag;
        }
    }
}
