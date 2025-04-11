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

// Handle message commands
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = "?";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

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

    // Tambahkan saldo ke pengguna
    const newBalance = await updateUserBalance(message.author.id, amount);

    // Kirim konfirmasi ke pengguna
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

    message.reply({ embeds: [embed] });
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

    message.reply({ embeds: [embed] });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === "topup") {
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
    } else if (interaction.customId === "help") {
      const embed = new EmbedBuilder()
        .setTitle("💰 Bantuan Top Up Bot")
        .setDescription("Cara menggunakan bot top up:")
        .addFields(
          {
            name: "💰 **?topup [jumlah]**",
            value: "Top up saldo kamu dengan jumlah tertentu.",
          },
          {
            name: "💸 **?saldo**",
            value: "Cek saldo kamu saat ini.",
          }
        )
        .setColor("Blue");

      await interaction.reply({ embeds: [embed], ephemeral: true });
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
            }> ingin top up sebesar Rp ${amount.toLocaleString("id-ID")}`
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
