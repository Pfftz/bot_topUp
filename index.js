require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { YtDlpPlugin } = require("@distube/yt-dlp");

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

client.once("ready", () => {
  console.log(`Bot nyanyi ON 🐣 ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = "?";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

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
  if (!interaction.isButton()) return;

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
      interaction.reply(`🔁 Mode loop: ${["off", "lagu", "antrian"][mode]}`);
      break;
    case "love":
      interaction.reply("❤️ Kamu suka lagu ini juga yaa~");
      break;
  }
});

client.login(process.env.DISCORD_TOKEN);
