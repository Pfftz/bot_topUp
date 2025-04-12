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
const fs = require("fs");
const path = require("path");

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Top-Up Bot ON 💰 ${client.user.tag}`);
});

// Handle message commands
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = "?";
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // Handle ?info command
  if (command === "info") {
    const embed = new EmbedBuilder()
      .setTitle(" APA KONTOL")
      .setDescription(
        "Pake tomboil aja nyet kalo lu males pake prefix ya konntol.\n\n" +
          "ini prefixnya kontol:\n" +
          "• `?topup [jumlah]` - apa iya gw harus jelasin satu satu? .\n" +
          "• `?saldo` - ini juga HAH?."
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

  // Handle ?topup command
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

  // Handle ?saldo command
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
});

// Handle button interactions
client.on("interactionCreate", async (interaction) => {
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

client.login(process.env.DISCORD_TOKEN);
