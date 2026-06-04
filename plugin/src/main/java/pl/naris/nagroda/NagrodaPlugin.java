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

        getCommand("discord").setExecutor(cmd);
        getCommand("discord").setTabCompleter(cmd);

        AdminDiscordCommand adminCmd = new AdminDiscordCommand(this);
        getCommand("admindiscord").setExecutor(adminCmd);
        getCommand("admindiscord").setTabCompleter(adminCmd);

        Bukkit.getPluginManager().registerEvents(new pl.naris.nagroda.reward.RewardSetupListener(this), this);
        Bukkit.getPluginManager().registerEvents(new pl.naris.nagroda.reward.DiscordRewardGUIListener(this), this);

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

    public void openDiscordRewardGUI(org.bukkit.entity.Player player) {
        pl.naris.nagroda.reward.DiscordRewardGUIHolder holder = new pl.naris.nagroda.reward.DiscordRewardGUIHolder();
        org.bukkit.inventory.Inventory inventory = Bukkit.createInventory(holder, 27, colorize("&#5865F2&l✦ Odbierz Nagrodę Discord ✦"));
        holder.setInventory(inventory);

        // Panele ozdobne (Dark theme z akcentami blurple)
        org.bukkit.inventory.ItemStack bluePane = new org.bukkit.inventory.ItemStack(org.bukkit.Material.BLUE_STAINED_GLASS_PANE);
        org.bukkit.inventory.meta.ItemMeta blueMeta = bluePane.getItemMeta();
        if (blueMeta != null) {
            blueMeta.setDisplayName(" ");
            bluePane.setItemMeta(blueMeta);
        }

        org.bukkit.inventory.ItemStack blackPane = new org.bukkit.inventory.ItemStack(org.bukkit.Material.BLACK_STAINED_GLASS_PANE);
        org.bukkit.inventory.meta.ItemMeta blackMeta = blackPane.getItemMeta();
        if (blackMeta != null) {
            blackMeta.setDisplayName(" ");
            blackPane.setItemMeta(blackMeta);
        }

        org.bukkit.inventory.ItemStack grayPane = new org.bukkit.inventory.ItemStack(org.bukkit.Material.GRAY_STAINED_GLASS_PANE);
        org.bukkit.inventory.meta.ItemMeta grayMeta = grayPane.getItemMeta();
        if (grayMeta != null) {
            grayMeta.setDisplayName(" ");
            grayPane.setItemMeta(grayMeta);
        }

        // Układ siatki
        for (int i = 0; i < inventory.getSize(); i++) {
            if (i == 13) continue; // Pomiń główkę
            if (i == 0 || i == 8 || i == 18 || i == 26) {
                inventory.setItem(i, bluePane); // Rogi: Niebieskie (Blurple)
            } else if (i < 9 || i > 17 || i == 9 || i == 17) {
                inventory.setItem(i, blackPane); // Ramka zewnętrzna: Czarna (Dark Mode)
            } else {
                inventory.setItem(i, grayPane); // Tło wewnątrz: Szare
            }
        }

        // Główka Discord z base64 przez GameProfile (refleksja dla 100% natychmiastowego działania)
        String base64 = "eyJ0ZXh0dXJlcyI6eyJTS0lOIjp7InVybCI6Imh0dHA6Ly90ZXh0dXJlcy5taW5lY3JhZnQubmV0L3RleHR1cmUvNWY4NjViYjg4ZjU2Y2UwMTBhOGQ5YWVhYWNlNDRhMmRkY2QzZDYzMTdhZWQ4OTkwYjQxYjRmZmEwMzk4MzZjMyJ9fX0=";
        org.bukkit.inventory.ItemStack discordHead = new org.bukkit.inventory.ItemStack(org.bukkit.Material.PLAYER_HEAD);
        org.bukkit.inventory.meta.SkullMeta skullMeta = (org.bukkit.inventory.meta.SkullMeta) discordHead.getItemMeta();
        if (skullMeta != null) {
            skullMeta.setDisplayName(colorize("&#5865F2&l✦ POŁĄCZ DISCORD ✦"));
            java.util.List<String> lore = new java.util.ArrayList<>();
            lore.add("");
            lore.add(colorize("  &fStatus: &c&lNiepołączone"));
            lore.add(colorize("  &fNagroda: &a&lDarmowe Przedmioty i Ranga"));
            lore.add("");
            lore.add(colorize("  &7Kliknij tutaj, aby otrzymać unikalny"));
            lore.add(colorize("  &7link na czacie i odebrać nagrodę!"));
            lore.add("");
            lore.add(colorize("  &#5865F2» Kliknij, aby przejść do dc.narismc.pl «"));
            skullMeta.setLore(lore);

            try {
                Class<?> gameProfileClass = Class.forName("com.mojang.authlib.GameProfile");
                java.lang.reflect.Constructor<?> gameProfileConstructor = gameProfileClass.getConstructor(java.util.UUID.class, String.class);
                Object profile = gameProfileConstructor.newInstance(java.util.UUID.randomUUID(), "");

                java.lang.reflect.Method getPropertiesMethod = gameProfileClass.getMethod("getProperties");
                Object propertiesMap = getPropertiesMethod.invoke(profile);

                java.lang.reflect.Method putMethod = propertiesMap.getClass().getMethod("put", Object.class, Object.class);

                Class<?> propertyClass = Class.forName("com.mojang.authlib.properties.Property");
                java.lang.reflect.Constructor<?> propertyConstructor = propertyClass.getConstructor(String.class, String.class);
                Object property = propertyConstructor.newInstance("textures", base64);

                putMethod.invoke(propertiesMap, "textures", property);

                java.lang.reflect.Field profileField = skullMeta.getClass().getDeclaredField("profile");
                profileField.setAccessible(true);
                profileField.set(skullMeta, profile);
            } catch (Exception e) {
                getLogger().warning("Błąd ustawiania tekstury główki przez refleksję: " + e.getMessage());
            }
            discordHead.setItemMeta(skullMeta);
        }

        inventory.setItem(13, discordHead);
        player.openInventory(inventory);
    }

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
        if (message == null) return null;
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("&#([A-Fa-f0-9]{6})");
        java.util.regex.Matcher matcher = pattern.matcher(message);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String hex = matcher.group(1);
            StringBuilder replacement = new StringBuilder("§x");
            for (char c : hex.toCharArray()) {
                replacement.append('§').append(c);
            }
            matcher.appendReplacement(sb, replacement.toString());
        }
        matcher.appendTail(sb);
        return org.bukkit.ChatColor.translateAlternateColorCodes('&', sb.toString());
    }
}
