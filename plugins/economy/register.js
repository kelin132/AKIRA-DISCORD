import { registerUser, isRegistered } from "./database.js";

export default {
  name: "register",
  description: "Register your account to the economy system",
  category: "economy",
  usage: ".register <name>",
  cooldown: 10,

  async run({ discord, args }) {
    const { message } = discord;
    const sender = message.author.id;
    const name = args.join(" ");

    if (!name) {
      return message.reply("❌ Please provide a name! Example: `.register Akira` status");
    }

    const alreadyRegistered = await isRegistered(sender, true);
    if (alreadyRegistered) {
      return message.reply("❌ You are already registered!");
    }

    await registerUser(sender, name, true);
    await message.reply(`✅ Successfully registered as **${name}**! Welcome to the Aidoru Community.`);
  },
};
