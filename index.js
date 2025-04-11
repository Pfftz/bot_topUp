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

// Handle message commands
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = "?";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("🎵 Selamat datang di Bot Musik!")
      .setDescription(
        "Mau dengerin apa hari ini? Berikut adalah cara menggunakan bot:"
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
        { name: "⏹ **Stop**", value: "Menghentikan lagu yang sedang diputar." },
        {
          name: "🔁 **Loop**",
          value: "Mengaktifkan mode loop untuk lagu atau antrian.",
        }
      )
      .setColor("Blue")
      .setFooter({ text: "Bot Musik - Nikmati harimu dengan musik!" });

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("play_song")
        .setLabel("Putar Lagu")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("help")
        .setLabel("Bantuan")
        .setStyle(ButtonStyle.Secondary)
    );

    return message.channel.send({ embeds: [embed], components: [controls] });
  }

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
    }
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
        interaction.reply(`🔁 Mode loop: ${["off", "lagu", "antrian"][mode]}`);
        break;
      case "love":
        interaction.reply("❤️ Kamu suka lagu ini juga yaa~");
        break;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
