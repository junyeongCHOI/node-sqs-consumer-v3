const path = require('path');
const nodeExternals = require('webpack-node-externals');

const cacheDirectory = path.resolve(__dirname, '.webpack-cache');

module.exports = (_, argv = {}) => {
  const mode = argv.mode ?? process.env.NODE_ENV ?? 'production';
  const isProduction = mode === 'production';

  return {
    mode,
    target: 'node18',
    entry: {
      index: './src/index.ts',
    },
    devtool: isProduction ? false : 'eval-cheap-module-source-map',
    stats: isProduction ? 'errors-warnings' : 'minimal',
    infrastructureLogging: {
      level: 'warn',
    },
    cache: {
      type: 'filesystem',
      cacheDirectory,
      buildDependencies: {
        config: [__filename],
      },
    },
    externalsPresets: { node: true },
    externals: [nodeExternals()],
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.json',
              },
            },
          ],
        },
      ],
    },
    optimization: {
      minimize: isProduction,
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      sideEffects: true,
      usedExports: true,
      removeAvailableModules: true,
      removeEmptyChunks: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    output: {
      filename: 'index.js',
      path: path.resolve(__dirname, 'dist'),
      library: {
        type: 'umd',
      },
      clean: true,
      // Set global this to aviod "self" undefined error
      globalObject: 'this',
    },
    performance: false,
  };
};
