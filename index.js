const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    if (!query) return message.channel.send("🎵 Mau putar lagu apa");

    // Membuat tombol kontrol musik
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("skip")
        .setLabel("⏭ Skip")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("stop")
        .setLabel("⛔ Stop")
        .setStyle(ButtonStyle.Danger)
    );

    // Memutar lagu dan mengirimkan tombol
    distube.play(message.member.voice.channel, query, {
      textChannel: message.channel,
      member: message.member,
    });
    message.channel.send({ content: "🎶 Kontrol musik:", components: [row] });
  }
});

// Event listener untuk tombol
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const queue = distube.getQueue(interaction.guildId);
  if (!queue)
    return interaction.reply({
      content: "❌ Tidak ada musik yang diputar!",
      ephemeral: true,
    });

  if (interaction.customId === "skip") {
    distube.skip(interaction.guildId);
    interaction.reply("⏭ Lagu dilewati!");
  } else if (interaction.customId === "stop") {
    distube.stop(interaction.guildId);
    interaction.reply("⛔ Musik dihentikan!");
  }
});

distube
  .on("playSong", (queue, song) => {
    queue.textChannel.send(
      `🎶 Memutar: **${song.name}** - \`${song.formattedDuration}\``
    );
  })
  .on("addSong", (queue, song) => {
    queue.textChannel.send(`➕ Ditambahkan ke antrian: **${song.name}**`);
  });

client.login(process.env.DISCORD_TOKEN);
