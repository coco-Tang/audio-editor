
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Audio Editor Demo',
      template: 'index.html'
    }),
    new CleanWebpackPlugin(['dist'], {exclude: ['media']})
  ],
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  },
  devServer: {
    contentBase: './dist'
  }
};