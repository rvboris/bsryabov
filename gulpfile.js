import del from 'del';
import fs from 'fs';
import path from 'path';
import gulp from 'gulp';
import nunjucksRender from 'gulp-nunjucks-render';
import data from 'gulp-data';
import concat from 'gulp-concat';
import cleanCSS from 'gulp-clean-css';
import htmlmin from 'gulp-htmlmin';
import imagemin from 'gulp-imagemin';
import postcss from 'gulp-postcss';
import normalize from 'postcss-normalize';
import debug from 'gulp-debug';
import revReplace from 'gulp-rev-replace';
import rev from 'gulp-rev';
import revdel from 'gulp-rev-delete-original';
import environments from 'gulp-environments';
import named from 'vinyl-named';
import webpack from 'webpack';
import gulpWebpack from 'webpack-stream';
import assets from 'postcss-assets';
import nested from 'postcss-nested';
import cssenv from 'postcss-preset-env';
import reporter from 'postcss-browser-reporter';
import cssimport from 'postcss-import';
import browserSync from 'browser-sync';
import workbox from 'workbox-build';
import webpackConfig from './webpack.config';

const bsServer = browserSync.create();
const pump = require('pump');

const BUILD_PATH = './build';
const SOURCE_PATH = './src';

const { production } = environments;

const reload = glob => (done) => {
  bsServer.reload(glob);
  done();
};

const getEnvironment = () => (production() ? 'production' : 'development');

gulp.task('clean', () => del(`${BUILD_PATH}/**/*`));

gulp.task('html', (done) => {
  const pumpTasks = [
    gulp.src(`${SOURCE_PATH}/pages/**/*.njk`),
    debug({ title: 'html:' }),
    data((file) => {
      const matchPath = file.path.match(/src\/pages\/(.+).njk/);
      const modelName = matchPath.length >= 2
        ? matchPath[1]
        : path.basename(file.path, '.njk');

      return JSON.parse(fs.readFileSync(`${SOURCE_PATH}/models/${modelName}.json`));
    }),
    nunjucksRender({
      path: [`${SOURCE_PATH}/templates`],
      manageEnv: (environment) => {
        environment.addGlobal('environment', getEnvironment());
      },
    }),
    production(htmlmin({
      collapseWhitespace: true,
    })),
    gulp.dest(BUILD_PATH),
  ];

  pump(pumpTasks, done);
});

gulp.task('css', (done) => {
  const pumpTasks = [
    gulp.src(`${SOURCE_PATH}/css/**/*.css`),
    debug({ title: 'css:' }),
    postcss([
      cssimport(),
      nested(),
      assets({
        loadPaths: [`${SOURCE_PATH}/img`],
        relative: true,
      }),
      normalize(),
      cssenv(),
      reporter(),
    ]),
    concat('styles.css'),
    production(cleanCSS()),
    gulp.dest(`${BUILD_PATH}/css`),
    bsServer.stream(),
  ];

  pump(pumpTasks, done);
});

gulp.task('js', () => {
  const config = Object.assign({}, webpackConfig, {
    mode: getEnvironment(),
  });

  return gulp.src(`${SOURCE_PATH}/js/main.js`)
    .pipe(named())
    .pipe(gulpWebpack(config, webpack))
    .pipe(gulp.dest(`${BUILD_PATH}/js`));
});

gulp.task('img', (done) => {
  const pumpTasks = [
    gulp.src(`${SOURCE_PATH}/img/**/*.{jpg,png,gif,svg}`),
    debug({ title: 'img:' }),
    production(imagemin()),
    gulp.dest(`${BUILD_PATH}/img`),
    bsServer.stream(),
  ];

  pump(pumpTasks, done);
});

gulp.task('manifest', () => gulp
  .src([
    `${SOURCE_PATH}/manifest.json`,
    `${SOURCE_PATH}/browserconfig.xml`,
  ])
  .pipe(gulp.dest(BUILD_PATH)));

gulp.task('assets', gulp.parallel('css', 'js', 'img', 'manifest'));

gulp.task('revision', gulp.series('assets', () => gulp.src(`${BUILD_PATH}/**/*.{css,js}`)
  .pipe(debug({ title: 'revision' }))
  .pipe(rev())
  .pipe(gulp.dest(BUILD_PATH))
  .pipe(revdel())
  .pipe(rev.manifest())
  .pipe(gulp.dest(BUILD_PATH))));

gulp.task('rev-replace', gulp.series('html', 'revision', () => {
  const manifest = gulp.src(`${BUILD_PATH}/rev-manifest.json`);

  return gulp.src(`${BUILD_PATH}/**/*.html`)
    .pipe(revReplace({ manifest }))
    .pipe(gulp.dest(BUILD_PATH));
}));

gulp.task('service-worker', (done) => {
  return workbox.generateSW({
    globDirectory: BUILD_PATH,
    globPatterns: ['**/*.{js,html,css,jpg,png,gif,svg}'],
    swDest: `${BUILD_PATH}/sw.js`,
    clientsClaim: true,
    skipWaiting: true,
    runtimeCaching: [
      {
        urlPattern: new RegExp('https://fonts.googleapis.com'),
        handler: 'staleWhileRevalidate',
      },
      {
        urlPattern: new RegExp('https://travis-ci.org'),
        handler: 'staleWhileRevalidate',
      },
    ],
  }).then(({ warnings }) => {
    // eslint-disable-next-line
    for (const warning of warnings) {
      // eslint-disable-next-line
      console.warn(warning);
    }

    done();
  }).catch((error) => {
    done(error);
  });
});

gulp.task('build', gulp.series('clean', gulp.parallel('html', 'assets')));

gulp.task('serve', gulp.series('build', () => {
  bsServer.init({
    server: {
      baseDir: BUILD_PATH,
    },
  });

  gulp.watch(`${SOURCE_PATH}/**/*.njk`, gulp.series('html', reload('*.html')));
  gulp.watch(`${SOURCE_PATH}/models/**/*.json`, gulp.series('html', reload('*.html')));
  gulp.watch(`${SOURCE_PATH}/img/**/*.{jpg,png,gif,svg}`, gulp.series('img', reload()));
  gulp.watch(`${SOURCE_PATH}/js/**/*.js`, gulp.series('js', reload()));
  gulp.watch(`${SOURCE_PATH}/css/**/*.css`, gulp.series('css', reload()));
}));

gulp.task('build-revision', gulp.series('clean', 'rev-replace', 'service-worker'));

gulp.task('default', gulp.series('build'));
