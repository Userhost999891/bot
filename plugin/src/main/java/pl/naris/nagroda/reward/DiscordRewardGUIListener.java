package pl.naris.nagroda.reward;

import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.ItemStack;
import pl.naris.nagroda.NagrodaPlugin;

public class DiscordRewardGUIListener implements Listener {

    private final NagrodaPlugin plugin;

    public DiscordRewardGUIListener(NagrodaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (event.getInventory().getHolder() instanceof DiscordRewardGUIHolder) {
            event.setCancelled(true);

            ItemStack clicked = event.getCurrentItem();
            if (clicked == null) return;

            if (event.getRawSlot() == 13) {
                Player player = (Player) event.getWhoClicked();
                player.closeInventory();

                player.sendMessage("");
                player.sendMessage(plugin.colorize("&#5865F2━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
                player.sendMessage(plugin.colorize("             &#5865F2&lDARMOWA NAGRODA DISCORD"));
                player.sendMessage("");
                player.sendMessage(plugin.colorize("  &fPołącz swoje konto Discord na naszej stronie www,"));
                player.sendMessage(plugin.colorize("  &faby odebrać unikalne przedmioty na serwerze!"));
                player.sendMessage("");

                net.md_5.bungee.api.chat.TextComponent message = new net.md_5.bungee.api.chat.TextComponent(
                        plugin.colorize("  &#5865F2&l✦ &fKliknij tutaj: &#5865F2&nhttp://dc.narismc.pl")
                );
                message.setClickEvent(new net.md_5.bungee.api.chat.ClickEvent(
                        net.md_5.bungee.api.chat.ClickEvent.Action.OPEN_URL,
                        "http://dc.narismc.pl"
                ));
                message.setHoverEvent(new net.md_5.bungee.api.chat.HoverEvent(
                        net.md_5.bungee.api.chat.HoverEvent.Action.SHOW_TEXT,
                        new net.md_5.bungee.api.chat.hover.content.Text(
                                plugin.colorize("&#5865F2Kliknij, aby przejść do dc.narismc.pl")
                        )
                ));
                player.spigot().sendMessage(message);

                player.sendMessage("");
                player.sendMessage(plugin.colorize("&#5865F2━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
                player.sendMessage("");
            }
        }
    }
}
