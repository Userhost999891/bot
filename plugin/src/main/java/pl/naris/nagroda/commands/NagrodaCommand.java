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
import java.util.stream.Collectors;

public class NagrodaCommand implements CommandExecutor, TabCompleter {

    private final NagrodaPlugin plugin;

    public NagrodaCommand(NagrodaPlugin plugin) {
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
            case "reload" -> {
                plugin.reload();
                sender.sendMessage(plugin.colorize(
                        plugin.getConfig().getString("messages.reload", "&a&l✦ &aKonfiguracja przeładowana!")));
            }

            case "info" -> {
                sender.sendMessage("");
                sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                sender.sendMessage(ChatColor.AQUA + " NMC-Nagroda v2.0");
                sender.sendMessage(ChatColor.GRAY + " Połączony z NarisMC Core Bot przez API");
                sender.sendMessage(ChatColor.GRAY + " URL: " + plugin.getConfig().getString("bot-url"));
                sender.sendMessage("");
                sender.sendMessage(ChatColor.WHITE + " Aktualne nagrody:");

                List<String> desc = plugin.getConfig().getStringList("reward-description");
                for (String line : desc) {
                    sender.sendMessage(ChatColor.AQUA + "  " + line);
                }

                sender.sendMessage("");
                sender.sendMessage(ChatColor.WHITE + " Komendy:");
                List<String> rewards = plugin.getConfig().getStringList("rewards");
                for (String cmd : rewards) {
                    sender.sendMessage(ChatColor.GRAY + "  → " + cmd);
                }

                sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                sender.sendMessage("");
            }

            case "setup" -> {
                if (args.length < 2) {
                    sender.sendMessage("");
                    sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    sender.sendMessage(ChatColor.AQUA + " /nagroda setup <komendy...>");
                    sender.sendMessage(ChatColor.GRAY + " Ustaw komendy nagród.");
                    sender.sendMessage(ChatColor.GRAY + " Użyj %player% jako placeholder.");
                    sender.sendMessage("");
                    sender.sendMessage(ChatColor.WHITE + " Przykład:");
                    sender.sendMessage(ChatColor.GRAY + "  /nagroda setup give %player% diamond 5");
                    sender.sendMessage("");
                    sender.sendMessage(ChatColor.YELLOW + " Kilka komend — oddziel | ");
                    sender.sendMessage(ChatColor.GRAY + "  /nagroda setup give %player% diamond 5 | eco give %player% 100");
                    sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    return true;
                }

                String rawCommands = String.join(" ", Arrays.copyOfRange(args, 1, args.length));
                String[] commands = rawCommands.split("\\s*\\|\\s*");
                List<String> commandList = new ArrayList<>();
                for (String cmd : commands) {
                    String trimmed = cmd.trim();
                    if (!trimmed.isEmpty()) {
                        commandList.add(trimmed);
                    }
                }

                if (commandList.isEmpty()) {
                    sender.sendMessage(ChatColor.RED + "Podaj przynajmniej jedną komendę!");
                    return true;
                }

                plugin.getConfig().set("rewards", commandList);
                plugin.saveConfig();

                sender.sendMessage(plugin.colorize(
                        plugin.getConfig().getString("messages.setup-saved", "&a&l✦ &aKomendy nagród zostały zapisane!")));
                sender.sendMessage(ChatColor.GRAY + "Zapisano " + commandList.size() + " komend:");
                for (String cmd : commandList) {
                    sender.sendMessage(ChatColor.AQUA + "  → " + cmd);
                }
            }

            default -> sendHelp(sender);
        }

        return true;
    }

    private void sendHelp(CommandSender sender) {
        sender.sendMessage("");
        sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        sender.sendMessage(ChatColor.AQUA + " NMC-Nagroda v2.0 — Pomoc");
        sender.sendMessage("");
        sender.sendMessage(ChatColor.YELLOW + " /nagroda setup <komendy>" + ChatColor.GRAY + " — Ustaw nagrody");
        sender.sendMessage(ChatColor.YELLOW + " /nagroda info" + ChatColor.GRAY + " — Pokaż ustawienia");
        sender.sendMessage(ChatColor.YELLOW + " /nagroda reload" + ChatColor.GRAY + " — Przeładuj config");
        sender.sendMessage(ChatColor.GOLD + "━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        sender.sendMessage("");
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                                @NotNull String alias, @NotNull String[] args) {
        List<String> completions = new ArrayList<>();
        if (!sender.hasPermission("nagroda.admin")) return completions;

        if (args.length == 1) {
            List<String> subs = Arrays.asList("setup", "reload", "info");
            return subs.stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .collect(Collectors.toList());
        }

        if (args.length >= 2 && args[0].equalsIgnoreCase("setup")) {
            completions.add("give %player% diamond 5");
        }

        return completions;
    }
}
