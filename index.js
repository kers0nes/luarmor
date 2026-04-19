const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// Data storage
let scripts = new Map();
let keys = new Map();
let buyerRoleId = null;

// Sample data
scripts.set('autofarm', {
    name: 'Auto Farm Script',
    code: `-- Auto Farm Script
local player = game.Players.LocalPlayer
while wait(0.5) do
    print('Farming...')
end`,
    author: 'Admin'
});

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`📜 Loaded ${scripts.size} scripts`);
    client.user.setActivity('!help | Luarmor Style', { type: 'WATCHING' });
});

// Generate random key
function generateKey() {
    return 'XXXX-XXXX-XXXX-XXXX'.replace(/X/g, () => {
        return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)];
    });
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const isAdmin = message.member.permissions.has('Administrator');

    // ========== PUBLIC COMMANDS ==========
    
    // !stats - View server statistics
    if (command === 'stats') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 Server Statistics')
            .addFields(
                { name: 'Total Scripts', value: `${scripts.size}`, inline: true },
                { name: 'Active Keys', value: `${keys.size}`, inline: true },
                { name: 'Total Members', value: `${message.guild.memberCount}`, inline: true }
            )
            .setTimestamp();
        await message.channel.send({ embeds: [embed] });
    }

    // !mykey - View your key
    if (command === 'mykey') {
        let userKey = null;
        for (let [key, data] of keys) {
            if (data.user === message.author.id) {
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
                    { name: 'Status', value: userKey.used ? '✅ Activated' : '⏳ Not activated', inline: true }
                );
            await message.channel.send({ embeds: [embed] });
        } else {
            await message.reply('❌ You don\'t have a key! Use `!freekey`');
        }
    }

    // !freekey - Claim free key
    if (command === 'freekey') {
        const newKey = generateKey();
        keys.set(newKey, { used: false, user: null, expires: null });
        await message.reply(`✅ Your free key: \`${newKey}\`\nUse \`!redeem ${newKey}\` to activate!`);
    }

    // !redeem <key> - Redeem license key
    if (command === 'redeem') {
        const keyCode = args[0];
        const keyData = keys.get(keyCode);
        
        if (!keyData) {
            return message.reply('❌ Invalid key!');
        }
        
        if (keyData.used) {
            return message.reply('❌ Key already used!');
        }
        
        keyData.used = true;
        keyData.user = message.author.id;
        keys.set(keyCode, keyData);
        
        if (buyerRoleId) {
            const role = message.guild.roles.cache.get(buyerRoleId);
            if (role) await message.member.roles.add(role);
        }
        
        await message.reply('✅ Key redeemed successfully! You now have access to scripts.');
    }

    // !resethwid - Reset HWID
    if (command === 'resethwid') {
        for (let [key, data] of keys) {
            if (data.user === message.author.id) {
                keys.delete(key);
                break;
            }
        }
        await message.reply('✅ HWID reset! You can now use a new key.');
    }

    // !getbuyerrole - Claim buyer role
    if (command === 'getbuyerrole') {
        let hasKey = false;
        for (let [_, data] of keys) {
            if (data.user === message.author.id && data.used) {
                hasKey = true;
                break;
            }
        }
        
        if (hasKey && buyerRoleId) {
            const role = message.guild.roles.cache.get(buyerRoleId);
            if (role) {
                await message.member.roles.add(role);
                await message.reply('✅ Buyer role granted!');
            }
        } else {
            await message.reply('❌ You need to redeem a key first! Use `!freekey` then `!redeem <key>`');
        }
    }

    // !viewscript <name> - View a script
    if (command === 'viewscript') {
        const scriptName = args.join(' ');
        let script = null;
        
        for (let [_, s] of scripts) {
            if (s.name.toLowerCase().includes(scriptName.toLowerCase())) {
                script = s;
                break;
            }
        }
        
        if (!script) {
            return message.reply('❌ Script not found! Use `!scripts` to see available scripts.');
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📝 ${script.name}`)
            .addFields(
                { name: 'Author', value: script.author, inline: true },
                { name: 'Code', value: `\`\`\`lua\n${script.code.substring(0, 1000)}\n\`\`\`` }
            );
        
        await message.channel.send({ embeds: [embed] });
    }

    // !scripts - List all scripts
    if (command === 'scripts') {
        if (scripts.size === 0) {
            return message.reply('No scripts available yet. Admin use `!addscript`');
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📜 Available Scripts')
            .setDescription('Use `!viewscript <name>` to get a script');
        
        for (let [_, script] of scripts) {
            embed.addFields({
                name: script.name,
                value: `Author: ${script.author}`,
                inline: false
            });
        }
        
        await message.channel.send({ embeds: [embed] });
    }

    // ========== ADMIN COMMANDS ==========
    
    // !addscript <name> <code> - Add a new script
    if (command === 'addscript' && isAdmin) {
        if (args.length < 2) {
            return message.reply('Usage: `!addscript <name> <code>`');
        }
        
        const name = args[0];
        const code = args.slice(1).join(' ');
        
        scripts.set(name.toLowerCase(), { name, code, author: message.author.tag });
        await message.reply(`✅ Script "${name}" added!`);
    }

    // !removescript <name> - Remove a script
    if (command === 'removescript' && isAdmin) {
        const name = args[0];
        
        if (scripts.delete(name.toLowerCase())) {
            await message.reply(`✅ Script "${name}" removed!`);
        } else {
            await message.reply('❌ Script not found!');
        }
    }

    // !setbuyerrole @role - Set buyer role
    if (command === 'setbuyerrole' && isAdmin) {
        const role = message.mentions.roles.first();
        if (!role) {
            return message.reply('Usage: `!setbuyerrole @role`');
        }
        
        buyerRoleId = role.id;
        await message.reply(`✅ Buyer role set to ${role.name}!`);
    }

    // !redeemkeys <amount> - Generate redeem keys
    if (command === 'redeemkeys' && isAdmin) {
        const amount = parseInt(args[0]) || 5;
        const generatedKeys = [];
        
        for (let i = 0; i < Math.min(amount, 20); i++) {
            const newKey = generateKey();
            keys.set(newKey, { used: false, user: null, expires: null });
            generatedKeys.push(newKey);
        }
        
        await message.reply(`✅ Generated ${generatedKeys.length} keys:\n\`\`\`\n${generatedKeys.join('\n')}\n\`\`\``);
    }

    // !hostscript <name> <code> - Host a script
    if (command === 'hostscript' && isAdmin) {
        if (args.length < 2) {
            return message.reply('Usage: `!hostscript <name> <code>`');
        }
        
        const name = args[0];
        const code = args.slice(1).join(' ');
        
        scripts.set(name.toLowerCase(), { name, code, author: message.author.tag, hosted: true });
        await message.reply(`✅ Script "${name}" hosted!`);
    }

    // !panel - Control panel
    if (command === 'panel' && isAdmin) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎮 Luarmor Control Panel')
            .setDescription('**Public Commands:**')
            .addFields(
                { name: '📊 Info', value: '`!stats` `!mykey` `!scripts`', inline: true },
                { name: '🔑 Keys', value: '`!freekey` `!redeem <key>` `!resethwid`', inline: true },
                { name: '📜 Scripts', value: '`!viewscript <name>` `!getbuyerrole`', inline: true },
                { name: '\u200B', value: '**Admin Commands:**', inline: false },
                { name: '⚙️ Management', value: '`!addscript` `!removescript` `!hostscript`', inline: true },
                { name: '🔐 Key System', value: '`!redeemkeys <amount>` `!setbuyerrole @role`', inline: true }
            )
            .setTimestamp();
        
        await message.channel.send({ embeds: [embed] });
    }

    // !setup - Setup guide
    if (command === 'setup' && isAdmin) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('⚙️ Setup Guide')
            .setDescription('Follow these steps:')
            .addFields(
                { name: '1️⃣ Set Buyer Role', value: '`!setbuyerrole @role`', inline: false },
                { name: '2️⃣ Generate Keys', value: '`!redeemkeys 10`', inline: false },
                { name: '3️⃣ Add Scripts', value: '`!addscript name code`', inline: false },
                { name: '4️⃣ View Panel', value: '`!panel`', inline: false }
            );
        
        await message.channel.send({ embeds: [embed] });
    }

    // !help - Show all commands
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📚 Commands List')
            .addFields(
                { name: 'Public Commands', value: '`!stats` `!mykey` `!freekey` `!redeem <key>` `!resethwid` `!getbuyerrole` `!viewscript <name>` `!scripts` `!help`', inline: false },
                { name: 'Admin Commands', value: '`!addscript` `!removescript` `!setbuyerrole` `!redeemkeys` `!hostscript` `!panel` `!setup`', inline: false }
            );
        
        await message.channel.send({ embeds: [embed] });
    }
});

client.login(DISCORD_TOKEN);
