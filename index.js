const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Data storage
let scripts = new Map(); // scriptId -> { name, code, author, host }
let keys = new Map(); // key -> { used, user, expires }
let buyerRoleId = null;

// Load data from files
try {
    if (fs.existsSync('./scripts.json')) {
        const data = JSON.parse(fs.readFileSync('./scripts.json'));
        scripts = new Map(data.scripts);
    }
    if (fs.existsSync('./keys.json')) {
        const data = JSON.parse(fs.readFileSync('./keys.json'));
        keys = new Map(data.keys);
    }
    if (fs.existsSync('./config.json')) {
        const config = JSON.parse(fs.readFileSync('./config.json'));
        buyerRoleId = config.buyerRoleId;
    }
} catch (e) {}

// Save functions
function saveScripts() {
    fs.writeFileSync('./scripts.json', JSON.stringify({ scripts: Array.from(scripts.entries()) }));
}

function saveKeys() {
    fs.writeFileSync('./keys.json', JSON.stringify({ keys: Array.from(keys.entries()) }));
}

function saveConfig() {
    fs.writeFileSync('./config.json', JSON.stringify({ buyerRoleId }));
}

// Generate random key
function generateKey() {
    return 'XXXX-XXXX-XXXX-XXXX'.replace(/X/g, () => {
        return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)];
    });
}

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online!`);
    
    // Register slash commands
    const commands = [
        new SlashCommandBuilder().setName('stats').setDescription('View server statistics'),
        new SlashCommandBuilder().setName('mykey').setDescription('View your key information'),
        new SlashCommandBuilder().setName('freekey').setDescription('Claim a free key'),
        new SlashCommandBuilder().setName('redeem').setDescription('Redeem a license key').addStringOption(option => option.setName('key').setDescription('Your license key').setRequired(true)),
        new SlashCommandBuilder().setName('resethwid').setDescription('Reset your hardware ID'),
        new SlashCommandBuilder().setName('getbuyerrole').setDescription('Claim your buyer role'),
        new SlashCommandBuilder().setName('viewscript').setDescription('View a script').addStringOption(option => option.setName('name').setDescription('Script name').setRequired(true)),
        
        // Admin commands
        new SlashCommandBuilder().setName('addscript').setDescription('Add a new script (Admin)').addStringOption(option => option.setName('name').setDescription('Script name').setRequired(true)).addStringOption(option => option.setName('code').setDescription('Lua code').setRequired(true)),
        new SlashCommandBuilder().setName('removescript').setDescription('Remove a script (Admin)').addStringOption(option => option.setName('name').setDescription('Script name').setRequired(true)),
        new SlashCommandBuilder().setName('setbuyerrole').setDescription('Set buyer role (Admin)').addRoleOption(option => option.setName('role').setDescription('Buyer role').setRequired(true)),
        new SlashCommandBuilder().setName('redeemkeys').setDescription('Generate redeem keys (Admin)').addIntegerOption(option => option.setName('amount').setDescription('Number of keys').setRequired(true)),
        new SlashCommandBuilder().setName('hostscript').setDescription('Host a script (Admin)').addStringOption(option => option.setName('name').setDescription('Script name').setRequired(true)).addStringOption(option => option.setName('code').setDescription('Lua code').setRequired(true)),
        new SlashCommandBuilder().setName('panel').setDescription('Setup control panel (Admin)'),
        new SlashCommandBuilder().setName('setup').setDescription('Setup the bot (Admin)')
    ];
    
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Slash commands registered!');
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
    
    client.user.setActivity('/panel | Luarmor Style', { type: 'WATCHING' });
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    
    const { commandName, user, member } = interaction;
    const isAdmin = member.permissions.has('Administrator');
    
    // Public commands
    if (commandName === 'stats') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 Server Statistics')
            .addFields(
                { name: 'Total Scripts', value: `${scripts.size}`, inline: true },
                { name: 'Active Keys', value: `${keys.size}`, inline: true },
                { name: 'Total Members', value: `${interaction.guild.memberCount}`, inline: true }
            )
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
    
    if (commandName === 'mykey') {
        let userKey = null;
        for (let [key, data] of keys) {
            if (data.user === user.id) {
                userKey = { key, ...data };
                break;
            }
        }
        
        if (userKey) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔑 Your Key')
                .addFields(
                    { name: 'Key', value: `\`${userKey.key}\``, inline: false },
                    { name: 'Expires', value: userKey.expires || 'Never', inline: true }
                );
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: '❌ You don\'t have a key! Use `/freekey` or `/redeem`', ephemeral: true });
        }
    }
    
    if (commandName === 'freekey') {
        if (keys.size >= 100) {
            return interaction.reply({ content: '❌ No free keys available!', ephemeral: true });
        }
        
        const newKey = generateKey();
        keys.set(newKey, { used: false, user: null, expires: null });
        saveKeys();
        
        await interaction.reply({ content: `✅ Your free key: \`${newKey}\`\nUse \`/redeem ${newKey}\` to activate!`, ephemeral: true });
    }
    
    if (commandName === 'redeem') {
        const keyCode = interaction.options.getString('key');
        const keyData = keys.get(keyCode);
        
        if (!keyData) {
            return interaction.reply({ content: '❌ Invalid key!', ephemeral: true });
        }
        
        if (keyData.used) {
            return interaction.reply({ content: '❌ Key already used!', ephemeral: true });
        }
        
        keyData.used = true;
        keyData.user = user.id;
        keys.set(keyCode, keyData);
        saveKeys();
        
        if (buyerRoleId) {
            const role = interaction.guild.roles.cache.get(buyerRoleId);
            if (role) await member.roles.add(role);
        }
        
        await interaction.reply({ content: '✅ Key redeemed successfully! You now have access to scripts.', ephemeral: true });
    }
    
    if (commandName === 'resethwid') {
        for (let [key, data] of keys) {
            if (data.user === user.id) {
                keys.delete(key);
                saveKeys();
                break;
            }
        }
        await interaction.reply({ content: '✅ HWID reset! You can now use a new key.', ephemeral: true });
    }
    
    if (commandName === 'getbuyerrole') {
        let hasKey = false;
        for (let [_, data] of keys) {
            if (data.user === user.id && data.used) {
                hasKey = true;
                break;
            }
        }
        
        if (hasKey && buyerRoleId) {
            const role = interaction.guild.roles.cache.get(buyerRoleId);
            if (role) {
                await member.roles.add(role);
                await interaction.reply({ content: '✅ Buyer role granted!', ephemeral: true });
            }
        } else {
            await interaction.reply({ content: '❌ You need to redeem a key first!', ephemeral: true });
        }
    }
    
    if (commandName === 'viewscript') {
        const scriptName = interaction.options.getString('name');
        const script = scripts.get(scriptName);
        
        if (!script) {
            return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📝 ${script.name}`)
            .addFields(
                { name: 'Author', value: script.author, inline: true },
                { name: 'Code', value: `\`\`\`lua\n${script.code.substring(0, 1000)}\n\`\`\`` }
            );
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // Admin commands
    if (commandName === 'addscript' && isAdmin) {
        const name = interaction.options.getString('name');
        const code = interaction.options.getString('code');
        
        scripts.set(name, { name, code, author: user.tag, host: user.id });
        saveScripts();
        
        await interaction.reply({ content: `✅ Script "${name}" added!`, ephemeral: true });
    }
    
    if (commandName === 'removescript' && isAdmin) {
        const name = interaction.options.getString('name');
        
        if (scripts.delete(name)) {
            saveScripts();
            await interaction.reply({ content: `✅ Script "${name}" removed!`, ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        }
    }
    
    if (commandName === 'setbuyerrole' && isAdmin) {
        const role = interaction.options.getRole('role');
        buyerRoleId = role.id;
        saveConfig();
        await interaction.reply({ content: `✅ Buyer role set to ${role.name}!`, ephemeral: true });
    }
    
    if (commandName === 'redeemkeys' && isAdmin) {
        const amount = interaction.options.getInteger('amount');
        const generatedKeys = [];
        
        for (let i = 0; i < amount; i++) {
            const newKey = generateKey();
            keys.set(newKey, { used: false, user: null, expires: null });
            generatedKeys.push(newKey);
        }
        saveKeys();
        
        await interaction.reply({ content: `✅ Generated ${amount} keys:\n\`\`\`\n${generatedKeys.join('\n')}\n\`\`\``, ephemeral: true });
    }
    
    if (commandName === 'hostscript' && isAdmin) {
        const name = interaction.options.getString('name');
        const code = interaction.options.getString('code');
        
        scripts.set(name, { name, code, author: user.tag, host: user.id });
        saveScripts();
        
        await interaction.reply({ content: `✅ Script "${name}" hosted!`, ephemeral: true });
    }
    
    if (commandName === 'panel' && isAdmin) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎮 Luarmor Control Panel')
            .setDescription('Use these commands to manage the bot')
            .addFields(
                { name: '📜 Script Management', value: '`/addscript` `/removescript` `/hostscript` `/viewscript`', inline: false },
                { name: '🔑 Key System', value: '`/redeemkeys` `/freekey` `/mykey`', inline: false },
                { name: '⚙️ Role Setup', value: '`/setbuyerrole` `/getbuyerrole`', inline: false },
                { name: '📊 Info', value: '`/stats` `/resethwid`', inline: false }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (commandName === 'setup' && isAdmin) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('⚙️ Setup Guide')
            .setDescription('Follow these steps to setup your bot:')
            .addFields(
                { name: '1️⃣ Set Buyer Role', value: '`/setbuyerrole @role`', inline: false },
                { name: '2️⃣ Generate Keys', value: '`/redeemkeys 10`', inline: false },
                { name: '3️⃣ Add Scripts', value: '`/addscript name code`', inline: false },
                { name: '4️⃣ View Panel', value: '`/panel`', inline: false }
            );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(DISCORD_TOKEN);
