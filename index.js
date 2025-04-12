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
  REST,
  Routes,
} = require("discord.js");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

// Initialize Express server for webhook handling
const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

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
  await fsPromises.writeFile(
    usersFilePath,
    JSON.stringify(users, null, 2),
    "utf8"
  );
  return users[userId];
}

// Transaction tracking
const pendingTransactions = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Register slash command
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationCommands(client.user?.id), {
      body: [
        {
          name: "info",
          description:
            "Menampilkan informasi tentang bot dan cara penggunaannya",
        },
      ],
    });

    console.log("Slash commands registered successfully.");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
})();

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
  console.log(`Top-Up Bot ON 💰 ${client.user.tag}`);
});

// Handle slash command
client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand() && interaction.commandName === "info") {
    const embed = new EmbedBuilder()
      .setTitle("💰 Selamat datang di Bot Top Up!")
      .setDescription(
        "Gunakan tombol di bawah ini untuk top up atau cek saldo.\n\n" +
          "Anda juga dapat menggunakan perintah berikut:\n" +
          "• `?topup [jumlah]` - Untuk top up saldo.\n" +
          "• `?saldo` - Untuk melihat saldo Anda."
      )
      .setColor("Blue");

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("topup")
        .setLabel("Top Up")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("saldo")
        .setLabel("Cek Saldo")
        .setStyle(ButtonStyle.Secondary)
    );

    return await interaction.reply({ embeds: [embed], components: [buttons] });
  }

  if (interaction.isButton()) {
    if (interaction.customId === "topup") {
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

      return await interaction.showModal(modal);
    }

    if (interaction.customId === "saldo") {
      const balance = getUserBalance(interaction.user.id);
      const embed = new EmbedBuilder()
        .setTitle("💰 Informasi Saldo")
        .setDescription(
          `<@${interaction.user.id}>, saldo kamu saat ini adalah:`
        )
        .addFields({
          name: "Saldo",
          value: `Rp ${balance.toLocaleString("id-ID")}`,
        })
        .setColor("Blue")
        .setTimestamp();

      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } else if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === "topup_modal") {
      const amountStr = interaction.fields.getTextInputValue("topup_amount");
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

      const newBalance = await updateUserBalance(interaction.user.id, amount);

      const embed = new EmbedBuilder()
        .setTitle("💰 Top Up Berhasil!")
        .setDescription(
          `<@${
            interaction.user.id
          }> berhasil top up sebesar Rp ${amount.toLocaleString("id-ID")}`
        )
        .addFields({
          name: "Saldo Sekarang",
          value: `Rp ${newBalance.toLocaleString("id-ID")}`,
        })
        .setColor("Green")
        .setTimestamp();

      return await interaction.reply({ embeds: [embed] });
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = "?";
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // Kirim UI tombol jika pesan hanya berisi prefix
  if (message.content === prefix) {
    const embed = new EmbedBuilder()
      .setTitle("💰 Selamat datang di Bot Top Up!")
      .setDescription(
        "Gunakan tombol di bawah ini untuk top up atau cek saldo."
      )
      .setColor("Blue");

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("topup")
        .setLabel("Top Up")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("saldo")
        .setLabel("Cek Saldo")
        .setStyle(ButtonStyle.Secondary)
    );

    return message.reply({ embeds: [embed], components: [buttons] });
  }

  // Handle perintah dengan prefix
  if (message.content.startsWith(prefix)) {
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

      const newBalance = await updateUserBalance(message.author.id, amount);

      const embed = new EmbedBuilder()
        .setTitle("💰 Top Up Berhasil!")
        .setDescription(
          `<@${
            message.author.id
          }> berhasil top up sebesar Rp ${amount.toLocaleString("id-ID")}`
        )
        .addFields({
          name: "Saldo Sekarang",
          value: `Rp ${newBalance.toLocaleString("id-ID")}`,
        })
        .setColor("Green")
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (command === "saldo") {
      const balance = getUserBalance(message.author.id);
      const embed = new EmbedBuilder()
        .setTitle("💰 Informasi Saldo")
        .setDescription(`<@${message.author.id}>, saldo kamu saat ini adalah:`)
        .addFields({
          name: "Saldo",
          value: `Rp ${balance.toLocaleString("id-ID")}`,
        })
        .setColor("Blue")
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
