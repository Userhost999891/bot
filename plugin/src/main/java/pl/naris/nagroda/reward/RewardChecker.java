package pl.naris.nagroda.reward;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import pl.naris.nagroda.NagrodaPlugin;
import pl.naris.nagroda.data.MySQLManager;

import java.util.List;

public class RewardChecker implements Runnable {

    private final NagrodaPlugin plugin;
    private final String serverId;

    public RewardChecker(NagrodaPlugin plugin) {
        this.plugin = plugin;
        this.serverId = plugin.getConfig().getString("server-id", "default");
    }

    @Override
    public void run() {
        // Get rewards not yet claimed by THIS server
        List<MySQLManager.PendingReward> pending = plugin.getMysqlManager().getPendingRewards(serverId);
        if (pending.isEmpty()) return;

        for (MySQLManager.PendingReward reward : pending) {
            // Find online player (case-insensitive)
            Player player = null;
            for (Player online : Bukkit.getOnlinePlayers()) {
                if (online.getName().equalsIgnoreCase(reward.playerName)) {
                    player = online;
                    break;
                }
            }

            // ONLY when player is ONLINE
            if (player != null) {
                final Player onlinePlayer = player;
                Bukkit.getScheduler().runTask(plugin, () -> giveReward(onlinePlayer));
                plugin.getMysqlManager().markClaimed(reward.playerName, serverId);
            }
        }
    }

    private void giveReward(Player player) {
        List<String> rewards = plugin.getConfig().getStringList("rewards");
        if (rewards.isEmpty()) {
            plugin.getLogger().warning("Lista nagród jest pusta w config.yml!");
            return;
        }

        for (String command : rewards) {
            String finalCommand = command.replace("%player%", player.getName());
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), finalCommand);
            plugin.getLogger().info("[" + plugin.getConfig().getString("server-id") + "] Wykonano: " + finalCommand);
        }

        String message = plugin.getConfig().getString("messages.reward-given",
                "&a&l✦ &aDziękujemy za weryfikację Discord!");
        player.sendMessage(plugin.colorize(message));

        plugin.getLogger().info("🎁 [" + plugin.getConfig().getString("server-id") + "] " + player.getName() + " otrzymał nagrodę!");
    }
}
