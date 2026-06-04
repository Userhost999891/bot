package pl.naris.nagroda.commands;

import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import pl.naris.nagroda.NagrodaPlugin;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

public class AdminDiscordCommand implements CommandExecutor, TabCompleter {

    private final NagrodaPlugin plugin;

    public AdminDiscordCommand(NagrodaPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label,
                             @NotNull String[] args) {

        if (!sender.hasPermission("nagroda.admin")) {
            sender.sendMessage(ChatColor.RED + "Nie masz uprawnień do tej komendy!");
            return true;
        }

        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "clink" -> {
                // Generate a new CLINK (Connect Link)
                String existingClink = plugin.getConfig().getString("clink", null);

                if (existingClink != null && !existingClink.isEmpty()) {
                    if (args.length < 2 || !args[1].equalsIgnoreCase("new")) {
                        sender.sendMessage("");
                        sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                        sender.sendMessage(ChatColor.AQUA + " Aktualny CLINK:");
                        sender.sendMessage(ChatColor.WHITE + " " + existingClink);
                        sender.sendMessage("");
                        sender.sendMessage(ChatColor.GRAY + " Wklej ten kod na stronie w polu CLINK");
                        sender.sendMessage(ChatColor.GRAY + " przy konfiguracji serwera w zakładce Nagrody MC.");
                        sender.sendMessage("");
                        sender.sendMessage(ChatColor.YELLOW + " Aby wygenerować nowy: " + ChatColor.WHITE + "/admindiscord clink new");
                        sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                        sender.sendMessage("");
                        return true;
                    }
                }

                // Generate new CLINK
                String serverId = plugin.getConfig().getString("server-id", "default");
                String newClink = serverId + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

                plugin.getConfig().set("clink", newClink);
                plugin.saveConfig();

                sender.sendMessage("");
                sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                sender.sendMessage(ChatColor.GREEN + " ✦ Nowy CLINK wygenerowany!");
                sender.sendMessage("");
                sender.sendMessage(ChatColor.WHITE + " " + newClink);
                sender.sendMessage("");
                sender.sendMessage(ChatColor.GRAY + " Skopiuj i wklej ten kod na stronie");
                sender.sendMessage(ChatColor.GRAY + " w polu CLINK przy konfiguracji serwera");
                sender.sendMessage(ChatColor.GRAY + " w zakładce Nagrody MC.");
                sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                sender.sendMessage("");
            }

            case "status" -> {
                String clink = plugin.getConfig().getString("clink", null);
                String serverId = plugin.getConfig().getString("server-id", "default");
                boolean mysqlOk = plugin.getMysqlManager() != null;

                sender.sendMessage("");
                sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                sender.sendMessage(ChatColor.AQUA + " Status połączenia Discord");
                sender.sendMessage("");
                sender.sendMessage(ChatColor.WHITE + " Server ID: " + ChatColor.GRAY + serverId);
                sender.sendMessage(ChatColor.WHITE + " MySQL: " + (mysqlOk ? ChatColor.GREEN + "Połączony ✓" : ChatColor.RED + "Rozłączony ✗"));
                sender.sendMessage(ChatColor.WHITE + " CLINK: " + (clink != null && !clink.isEmpty() ? ChatColor.GREEN + "Ustawiony ✓" : ChatColor.RED + "Brak ✗"));
                if (clink != null && !clink.isEmpty()) {
                    sender.sendMessage(ChatColor.GRAY + " → " + clink);
                }
                sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                sender.sendMessage("");
            }

            default -> sendHelp(sender);
        }

        return true;
    }

    private void sendHelp(CommandSender sender) {
        sender.sendMessage("");
        sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        sender.sendMessage(ChatColor.AQUA + " AdminDiscord — Pomoc");
        sender.sendMessage("");
        sender.sendMessage(ChatColor.YELLOW + " /admindiscord clink" + ChatColor.GRAY + " — Pokaż/Generuj CLINK");
        sender.sendMessage(ChatColor.YELLOW + " /admindiscord clink new" + ChatColor.GRAY + " — Generuj nowy CLINK");
        sender.sendMessage(ChatColor.YELLOW + " /admindiscord status" + ChatColor.GRAY + " — Status połączenia");
        sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        sender.sendMessage("");
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                                @NotNull String alias, @NotNull String[] args) {
        List<String> completions = new ArrayList<>();
        if (!sender.hasPermission("nagroda.admin")) return completions;

        if (args.length == 1) {
            List<String> subs = Arrays.asList("clink", "status");
            return subs.stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .collect(Collectors.toList());
        }

        if (args.length == 2 && args[0].equalsIgnoreCase("clink")) {
            completions.add("new");
        }

        return completions;
    }
}
