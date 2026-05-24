package pl.naris.nagroda.reward;

import org.bukkit.Bukkit;
import pl.naris.nagroda.NagrodaPlugin;
import pl.naris.nagroda.data.MySQLManager;

import java.util.List;

public class CommandChecker implements Runnable {

    private final NagrodaPlugin plugin;

    public CommandChecker(NagrodaPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public void run() {
        List<MySQLManager.PendingCommand> commands = plugin.getMysqlManager().getPendingCommands();
        if (commands.isEmpty()) return;

        for (MySQLManager.PendingCommand cmd : commands) {
            Bukkit.getScheduler().runTask(plugin, () -> {
                try {
                    Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd.command);
                    plugin.getLogger().info("⚡ Wykonano komendę [" + cmd.id + "]: " + cmd.command
                            + " (gracz: " + cmd.playerName + ")");

                    // Mark as executed async — back off the main thread
                    Bukkit.getScheduler().runTaskAsynchronously(plugin, () ->
                            plugin.getMysqlManager().markCommandExecuted(cmd.id));
                } catch (Exception e) {
                    plugin.getLogger().severe("❌ Błąd komendy [" + cmd.id + "]: " + e.getMessage());

                    Bukkit.getScheduler().runTaskAsynchronously(plugin, () ->
                            plugin.getMysqlManager().markCommandFailed(cmd.id));
                }
            });
        }
    }
}
