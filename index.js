require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType,
} = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const express = require("express");
const bodyParser = require("body-parser");
const midtransClient = require("midtrans-client");
const fs = require("fs");
const path = require("path");

// Initialize Express server for webhook handling
const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// Initialize Midtrans Client
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// Ensure users.json exists
const usersFilePath = path.join(__dirname, "users.json");
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify({}), "utf8");
}

// User balance management functions
function getUserBalance(userId) {
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    return users[userId] || 0;
}

const { promises: fsPromises } = require("fs");

async function updateUserBalance(userId, amount) {
    const users = JSON.parse(await fsPromises.readFile(usersFilePath, "utf8"));
    if (!users[userId]) {
        users[userId] = 0;
    }
    users[userId] += amount;
    await fsPromises.writeFile(usersFilePath, JSON.stringify(users, null, 2), "utf8");
    return users[userId];
}

// Transaction tracking
const pendingTransactions = {};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const distube = new DisTube(client, {
    emitNewSongOnly: true,
    plugins: [new SpotifyPlugin(), new SoundCloudPlugin(), new YtDlpPlugin()],
});

// Start the Express server
app.post("/midtrans-callback", (req, res) => {
    const notification = req.body;
    console.log("Received notification:", notification);

    // Verify the notification with Midtrans
    snap.transaction.notification(notification)
        .then((statusResponse) => {
            const orderId = statusResponse.order_id;
            const transactionStatus = statusResponse.transaction_status;
            const fraudStatus = statusResponse.fraud_status;

            console.log(`Transaction notification received. Order ID: ${orderId}`);

            // Check if this is a registered transaction
            if (!pendingTransactions[orderId]) {
                console.log(`Unknown transaction: ${orderId}`);
                return res.status(200).send("OK");
            }

            const { userId, channelId, amount } = pendingTransactions[orderId];

            // Handle transaction status
            if (transactionStatus == "capture") {
                if (fraudStatus == "challenge") {
                    // Transaction is challenged, do nothing yet
                } else if (fraudStatus == "accept") {
                    // Payment success and accepted
                    processSuccessfulPayment(userId, channelId, amount, orderId);
                }
            } else if (transactionStatus == "settlement") {
                // Payment success
                processSuccessfulPayment(userId, channelId, amount, orderId);
            } else if (
                transactionStatus == "cancel" ||
                transactionStatus == "deny" ||
                transactionStatus == "expire"
            ) {
                // Payment failed
                const channel = client.channels.cache.get(channelId);
                if (channel) {
                    channel.send(
                        `<@${userId}> Pembayaran untuk order ${orderId} gagal atau dibatalkan.`
                    );
                }
                delete pendingTransactions[orderId];
            }

            res.status(200).send("OK");
        })
        .catch((error) => {
            console.error("Error verifying transaction notification:", error);
            res.status(500).send("Internal Server Error");
        });
});

function processSuccessfulPayment(userId, channelId, amount, orderId) {
    // Update user balance
    const newBalance = updateUserBalance(userId, amount);

    // Notify user of successful payment
    const channel = client.channels.cache.get(channelId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle("💰 Top Up Berhasil!")
            .setDescription(
                `<@${userId}> berhasil top up sebesar Rp ${amount.toLocaleString(
                    "id-ID"
                )}`
            )
            .addFields(
                { name: "Order ID", value: orderId },
                {
                    name: "Saldo Sekarang",
                    value: `Rp ${newBalance.toLocaleString("id-ID")}`,
                }
            )
            .setColor("Green")
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    // Remove from pending transactions
    delete pendingTransactions[orderId];
}

// Start Express server
app.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
});

client.once("ready", () => {
    console.log(`Bot nyanyi ON 🐣 ${client.user.tag}`);
});

// Handle message commands
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const prefix = "?";
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (command === "help") {
        const embed = new EmbedBuilder()
            .setTitle("🎵 Selamat datang di Bot Musik & Top Up!")
            .setDescription(
                "Mau dengerin apa hari ini? Atau mau top up saldo? Berikut adalah cara menggunakan bot:"
            )
            .addFields(
                {
                    name: "▶ **?play [judul/URL]**",
                    value: "Memutar lagu dari YouTube, Spotify, atau SoundCloud.",
                },
                {
                    name: "⏸ **Pause/Resume**",
                    value: "Gunakan tombol untuk menjeda atau melanjutkan lagu.",
                },
                {
                    name: "⏹ **Stop**",
                    value: "Menghentikan lagu yang sedang diputar.",
                },
                {
                    name: "🔁 **Loop**",
                    value: "Mengaktifkan mode loop untuk lagu atau antrian.",
                },
                {
                    name: "💰 **?topup [jumlah]**",
                    value: "Top up saldo kamu dengan jumlah tertentu.",
                },
                {
                    name: "💸 **?saldo**",
                    value: "Cek saldo kamu saat ini.",
                }
            )
            .setColor("Blue")
            .setFooter({ text: "Bot Musik & Top Up - Nikmati harimu!" });

        const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("play_song")
                .setLabel("Putar Lagu")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("help")
                .setLabel("Bantuan")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("topup")
                .setLabel("Top Up")
                .setStyle(ButtonStyle.Success)
        );

        return message.channel.send({
            embeds: [embed],
            components: [controls],
        });
    }

    // Handle music commands
    if (command === "play") {
        const query = args.join(" ");
        if (!query) return message.channel.send("🎵 Mau putar lagu apa?");

        if (!message.member.voice.channel)
            return message.reply("❌ Masuk ke voice channel dulu dong~");

        distube.play(message.member.voice.channel, query, {
            textChannel: message.channel,
            member: message.member,
        });
    }

    // Handle top up command
    if (command === "topup") {
        const amount = parseInt(args[0]);
        if (!amount || isNaN(amount) || amount <= 0) {
            return message.reply(
                "❌ Masukkan jumlah top up yang valid! Contoh: `?topup 50000`"
            );
        }

        if (amount < 10000) {
            return message.reply("❌ Minimal top up Rp 10.000");
        }

        // Create order ID
        const orderId = `TOPUP-${message.author.id}-${Date.now()}`;

        // Create transaction parameter
        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: amount,
            },
            credit_card: {
                secure: true,
            },
            customer_details: {
                first_name: message.author.username,
                email: `${message.author.id}@discord.user`,
            },
        };

        try {
            // Create transaction and get redirect URL
            const transaction = await snap.createTransaction(parameter);
            const redirectUrl = transaction.redirect_url;

            // Store pending transaction
            pendingTransactions[orderId] = {
                userId: message.author.id,
                channelId: message.channel.id,
                amount: amount,
            };

            // Create payment embed
            const embed = new EmbedBuilder()
                .setTitle("💰 Top Up Saldo")
                .setDescription(
                    `<@${
                        message.author.id
                    }> ingin top up sebesar Rp ${amount.toLocaleString(
                        "id-ID"
                    )}`
                )
                .addFields(
                    { name: "Order ID", value: orderId },
                    {
                        name: "Link Pembayaran",
                        value: `[Klik disini untuk membayar](${redirectUrl})`,
                    }
                )
                .setColor("Gold")
                .setFooter({ text: "Link pembayaran berlaku selama 24 jam" })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Error creating transaction:", error);
            message.reply(
                "❌ Terjadi kesalahan saat membuat transaksi. Silakan coba lagi nanti."
            );
        }
    }

    // Handle balance check command
    if (command === "saldo") {
        const balance = getUserBalance(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle("💰 Informasi Saldo")
            .setDescription(
                `<@${message.author.id}>, saldo kamu saat ini adalah:`
            )
            .addFields({
                name: "Saldo",
                value: `Rp ${balance.toLocaleString("id-ID")}`,
            })
            .setColor("Blue")
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
});

// Embed + tombol ketika lagu diputar
distube.on("playSong", async (queue, song) => {
    const embed = new EmbedBuilder()
        .setTitle("Now playing")
        .setDescription(`[${song.name}](${song.url})`)
        .setThumbnail(song.thumbnail)
        .addFields({ name: "\u200b", value: `\`${song.formattedDuration}\`` })
        .setColor("Purple");

    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("pause")
            .setEmoji("⏸")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("resume")
            .setEmoji("▶")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("stop")
            .setEmoji("⏹")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("loop")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("love")
            .setEmoji("❤️")
            .setStyle(ButtonStyle.Secondary)
    );

    queue.textChannel.send({ embeds: [embed], components: [controls] });
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === "play_song") {
            // Buat modal untuk input judul lagu
            const modal = new ModalBuilder()
                .setCustomId("play_song_modal")
                .setTitle("Putar Lagu");

            const songInput = new TextInputBuilder()
                .setCustomId("song_name")
                .setLabel("Masukkan judul atau URL lagu:")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Contoh: Never Gonna Give You Up")
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(songInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        } else if (interaction.customId === "topup") {
            // Create modal for topup amount input
            const modal = new ModalBuilder()
                .setCustomId("topup_modal")
                .setTitle("Top Up Saldo");

            const amountInput = new TextInputBuilder()
                .setCustomId("topup_amount")
                .setLabel("Masukkan jumlah top up (min. Rp 10.000):")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Contoh: 50000")
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(amountInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        } else {
            const queue = distube.getQueue(interaction.guildId);
            if (!queue)
                return interaction.reply({
                    content: "❌ Tidak ada musik yang diputar!",
                    ephemeral: true,
                });

            const id = interaction.customId;
            switch (id) {
                case "pause":
                    distube.pause(interaction.guildId);
                    interaction.reply("⏸ Musik dijeda!");
                    break;
                case "resume":
                    distube.resume(interaction.guildId);
                    interaction.reply("▶ Musik dilanjut!");
                    break;
                case "stop":
                    distube.stop(interaction.guildId);
                    interaction.reply("⛔ Musik dihentikan!");
                    break;
                case "loop":
                    let mode = distube.setRepeatMode(
                        interaction.guildId,
                        (queue.repeatMode + 1) % 3
                    );
                    interaction.reply(
                        `🔁 Mode loop: ${["off", "lagu", "antrian"][mode]}`
                    );
                    break;
                case "love":
                    interaction.reply("❤️ Kamu suka lagu ini juga yaa~");
                    break;
            }
        }
    } else if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId === "play_song_modal") {
            const songName = interaction.fields.getTextInputValue("song_name");

            if (!interaction.member.voice.channel) {
                return interaction.reply({
                    content: "❌ Masuk ke voice channel dulu dong~",
                    ephemeral: true,
                });
            }

            distube.play(interaction.member.voice.channel, songName, {
                textChannel: interaction.channel,
                member: interaction.member,
            });

            await interaction.reply(`🎵 Memutar lagu: **${songName}**`);
        } else if (interaction.customId === "topup_modal") {
            const amountStr =
                interaction.fields.getTextInputValue("topup_amount");
            const amount = parseInt(amountStr);

            if (isNaN(amount) || amount <= 0) {
                return interaction.reply({
                    content: "❌ Jumlah top up tidak valid!",
                    ephemeral: true,
                });
            }

            if (amount < 10000) {
                return interaction.reply({
                    content: "❌ Minimal top up Rp 10.000",
                    ephemeral: true,
                });
            }

            // Create order ID
            const orderId = `TOPUP-${interaction.user.id}-${Date.now()}`;

            // Create transaction parameter
            const parameter = {
                transaction_details: {
                    order_id: orderId,
                    gross_amount: amount,
                },
                credit_card: {
                    secure: true,
                },
                customer_details: {
                    first_name: interaction.user.username,
                    email: `${interaction.user.id}@discord.user`,
                },
            };

            try {
                // Create transaction and get redirect URL
                const transaction = await snap.createTransaction(parameter);
                const redirectUrl = transaction.redirect_url;

                // Store pending transaction
                pendingTransactions[orderId] = {
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
                    amount: amount,
                };

                // Create payment embed
                const embed = new EmbedBuilder()
                    .setTitle("💰 Top Up Saldo")
                    .setDescription(
                        `<@${
                            interaction.user.id
                        }> ingin top up sebesar Rp ${amount.toLocaleString(
                            "id-ID"
                        )}`
                    )
                    .addFields(
                        { name: "Order ID", value: orderId },
                        {
                            name: "Link Pembayaran",
                            value: `[Klik disini untuk membayar](${redirectUrl})`,
                        }
                    )
                    .setColor("Gold")
                    .setFooter({
                        text: "Link pembayaran berlaku selama 24 jam",
                    })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error("Error creating transaction:", error);
                await interaction.reply({
                    content:
                        "❌ Terjadi kesalahan saat membuat transaksi. Silakan coba lagi nanti.",
                    ephemeral: true,
                });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
