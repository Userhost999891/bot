package pl.naris.nagroda.reward;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import pl.naris.nagroda.NagrodaPlugin;

import java.util.ArrayList;
import java.util.List;

public class RewardSetupListener implements Listener {

    private final NagrodaPlugin plugin;

    public RewardSetupListener(NagrodaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onInventoryClose(InventoryCloseEvent event) {
        Inventory inventory = event.getInventory();
        if (inventory.getHolder() instanceof RewardSetupHolder) {
            Player player = (Player) event.getPlayer();
            List<ItemStack> activeItems = new ArrayList<>();
            for (ItemStack item : inventory.getContents()) {
                if (item != null && item.getType() != org.bukkit.Material.AIR) {
                    activeItems.add(item);
                }
            }
            plugin.getConfig().set("reward-items", activeItems);
            plugin.saveConfig();
            player.sendMessage(plugin.colorize("&a&l✦ &aPrzedmioty nagrody zostały pomyślnie zapisane!"));
        }
    }
}
