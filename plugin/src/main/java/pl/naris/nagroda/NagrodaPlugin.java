package pl.naris.nagroda;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.plugin.java.JavaPlugin;
import pl.naris.nagroda.commands.NagrodaCommand;
import pl.naris.nagroda.data.MySQLManager;
import pl.naris.nagroda.reward.RewardChecker;

public class NagrodaPlugin extends JavaPlugin {

    private MySQLManager mysqlManager;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        getLogger().info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        getLogger().info(" NMC-Nagroda v2.0");
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

        int interval = getConfig().getInt("check-interval", 10);
        RewardChecker checker = new RewardChecker(this);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, checker, 20L * 5, 20L * interval);

        getLogger().info("✅ NMC-Nagroda v2.0 włączony! Sprawdzanie co " + interval + "s");
    }

    @Override
    public void onDisable() {
        if (mysqlManager != null) mysqlManager.close();
        getLogger().info("NMC-Nagroda wyłączony.");
    }

    public MySQLManager getMysqlManager() { return mysqlManager; }

    public void reload() {
        reloadConfig();
        getLogger().info("Konfiguracja przeładowana!");
    }

    public String colorize(String message) {
        return ChatColor.translateAlternateColorCodes('&', message);
    }
}
