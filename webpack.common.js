const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    main: './js/pages/main.js',
    profile: './js/pages/profile.js',
    leaderboard: './js/pages/leaderboard.js',
    chats: './js/pages/chats.js',
    forum: './js/pages/forum.js',
    topic: './js/pages/topic.js',
    auth: './js/pages/auth.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: 'js/[name].js',
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html',
      chunks: ['main'],
    }),
    new HtmlWebpackPlugin({
      template: './profile.html',
      filename: 'profile.html',
      chunks: ['profile'],
    }),
    new HtmlWebpackPlugin({
      template: './leaderboard.html',
      filename: 'leaderboard.html',
      chunks: ['leaderboard'],
    }),
    new HtmlWebpackPlugin({
      template: './chats.html',
      filename: 'chats.html',
      chunks: ['chats'],
    }),
    new HtmlWebpackPlugin({
      template: './forum.html',
      filename: 'forum.html',
      chunks: ['forum'],
    }),
    new HtmlWebpackPlugin({
      template: './topic.html',
      filename: 'topic.html',
      chunks: ['topic'],
    }),
    new HtmlWebpackPlugin({
      template: './auth.html',
      filename: 'auth.html',
      chunks: ['auth'],
    }),
  ],
};
