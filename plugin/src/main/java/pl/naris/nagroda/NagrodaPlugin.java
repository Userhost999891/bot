package pl.naris.nagroda;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.plugin.java.JavaPlugin;
import pl.naris.nagroda.commands.AdminDiscordCommand;
import pl.naris.nagroda.commands.NagrodaCommand;
import pl.naris.nagroda.data.MySQLManager;
import pl.naris.nagroda.reward.CommandChecker;
import pl.naris.nagroda.reward.RewardChecker;

public class NagrodaPlugin extends JavaPlugin {

    private MySQLManager mysqlManager;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        getLogger().info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        getLogger().info(" NMC-Nagroda v2.1");
        getLogger().info(" Łączenie z MySQL...");
        getLogger().info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        mysqlManager = new MySQLManager(this);
        if (!mysqlManager.connect()) {
            getLogger().severe("Nie udało się połączyć z MySQL! Plugin wyłączony.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        getLogger().info("✅ Połączono z MySQL!");

        NagrodaCommand cmd = new NagrodaCommand(this);
        getCommand("nagroda").setExecutor(cmd);
        getCommand("nagroda").setTabCompleter(cmd);

        AdminDiscordCommand adminCmd = new AdminDiscordCommand(this);
        getCommand("admindiscord").setExecutor(adminCmd);
        getCommand("admindiscord").setTabCompleter(adminCmd);

        Bukkit.getPluginManager().registerEvents(new pl.naris.nagroda.reward.RewardSetupListener(this), this);

        int interval = getConfig().getInt("check-interval", 10);
        RewardChecker checker = new RewardChecker(this);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, checker, 20L * 5, 20L * interval);

        CommandChecker cmdChecker = new CommandChecker(this);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, cmdChecker, 20L * 3, 20L * 5);

        getLogger().info("✅ NMC-Nagroda v2.1 włączony! Sprawdzanie co " + interval + "s");
    }

    @Override
    public void onDisable() {
        if (mysqlManager != null) mysqlManager.close();
        getLogger().info("NMC-Nagroda wyłączony.");
    }

    public MySQLManager getMysqlManager() { return mysqlManager; }

    public void openRewardSetup(org.bukkit.entity.Player player) {
        pl.naris.nagroda.reward.RewardSetupHolder holder = new pl.naris.nagroda.reward.RewardSetupHolder();
        org.bukkit.inventory.Inventory inventory = Bukkit.createInventory(holder, 27, colorize("&9✦ Ustaw nagrodę (Przedmioty)"));
        holder.setInventory(inventory);

        java.util.List<?> list = getConfig().getList("reward-items");
        if (list != null) {
            int slot = 0;
            for (Object obj : list) {
                if (obj instanceof org.bukkit.inventory.ItemStack && slot < inventory.getSize()) {
                    inventory.setItem(slot++, (org.bukkit.inventory.ItemStack) obj);
                }
            }
        }

        player.openInventory(inventory);
    }

    public void reload() {
        reloadConfig();
        getLogger().info("Konfiguracja przeładowana!");
    }

    public String colorize(String message) {
        return ChatColor.translateAlternateColorCodes('&', message);
    }
}
