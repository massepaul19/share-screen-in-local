const path = require('path');

module.exports = {
  mode: 'production',
  entry: './node_modules/mediasoup-client/lib/index.js',
  output: {
    path: path.resolve(__dirname, 'public/static'),
    filename: 'mediasoup-client.min.js',
    library: 'mediasoupClient',
    libraryTarget: 'window',
    libraryExport: 'default'
  },
  resolve: {
    extensions: ['.js', '.ts'],
    fallback: {
      'crypto': false,
      'path': false,
      'fs': false
    }
  },
  target: 'web',
  optimization: {
    minimize: true
  }
};
