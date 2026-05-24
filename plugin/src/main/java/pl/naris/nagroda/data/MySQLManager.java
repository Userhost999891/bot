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
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS pending_commands (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        player_name VARCHAR(16) NOT NULL,
                        command TEXT NOT NULL,
                        source VARCHAR(50) DEFAULT 'discord',
                        guild_id VARCHAR(20),
                        status ENUM('pending','executed','failed') DEFAULT 'pending',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        executed_at TIMESTAMP NULL
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

    /**
     * Get all commands with status='pending'
     */
    public List<PendingCommand> getPendingCommands() {
        ensureConnection();
        List<PendingCommand> commands = new ArrayList<>();

        String sql = "SELECT id, player_name, command FROM pending_commands WHERE status = 'pending'";

        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            ResultSet rs = stmt.executeQuery();
            while (rs.next()) {
                commands.add(new PendingCommand(
                        rs.getInt("id"),
                        rs.getString("player_name"),
                        rs.getString("command")
                ));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Błąd pobierania komend: " + e.getMessage());
        }

        return commands;
    }

    /**
     * Mark command as executed and set executed_at timestamp
     */
    public void markCommandExecuted(int id) {
        ensureConnection();
        String sql = "UPDATE pending_commands SET status = 'executed', executed_at = NOW() WHERE id = ?";

        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, id);
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Błąd oznaczania komendy jako wykonanej: " + e.getMessage());
        }
    }

    /**
     * Mark command as failed
     */
    public void markCommandFailed(int id) {
        ensureConnection();
        String sql = "UPDATE pending_commands SET status = 'failed' WHERE id = ?";

        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, id);
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Błąd oznaczania komendy jako nieudanej: " + e.getMessage());
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

    public static class PendingCommand {
        public final int id;
        public final String playerName;
        public final String command;

        public PendingCommand(int id, String playerName, String command) {
            this.id = id;
            this.playerName = playerName;
            this.command = command;
        }
    }
}
