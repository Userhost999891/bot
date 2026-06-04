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
        List<?> items = plugin.getConfig().getList("reward-items");

        boolean hasRewards = (rewards != null && !rewards.isEmpty());
        boolean hasItems = (items != null && !items.isEmpty());

        if (!hasRewards && !hasItems) {
            plugin.getLogger().warning("Brak skonfigurowanych nagród (komend i przedmiotów) w config.yml!");
            return;
        }

        // Wykonanie komend
        if (hasRewards) {
            for (String command : rewards) {
                String finalCommand = command.replace("%player%", player.getName());
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), finalCommand);
                plugin.getLogger().info("[" + plugin.getConfig().getString("server-id") + "] Wykonano: " + finalCommand);
            }
        }

        // Rozdanie przedmiotów
        if (hasItems) {
            for (Object obj : items) {
                if (obj instanceof org.bukkit.inventory.ItemStack) {
                    org.bukkit.inventory.ItemStack item = ((org.bukkit.inventory.ItemStack) obj).clone();
                    java.util.HashMap<Integer, org.bukkit.inventory.ItemStack> remaining = player.getInventory().addItem(item);
                    if (!remaining.isEmpty()) {
                        for (org.bukkit.inventory.ItemStack rem : remaining.values()) {
                            player.getWorld().dropItemNaturally(player.getLocation(), rem);
                        }
                    }
                }
            }
        }

        String message = plugin.getConfig().getString("messages.reward-given",
                "&a&l✦ &aDziękujemy za weryfikację Discord!");
        player.sendMessage(plugin.colorize(message));

        plugin.getLogger().info("🎁 [" + plugin.getConfig().getString("server-id") + "] " + player.getName() + " otrzymał nagrodę!");
    }
}
