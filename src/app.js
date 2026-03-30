import express from 'express';
import { engine } from 'express-handlebars';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: join(__dirname, '../views/layouts'),
  partialsDir: join(__dirname, '../views/partials'),
}));

app.set('view engine', 'hbs');
app.set('views', join(__dirname, '../views'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(join(__dirname, '../public')));

app.use('/', routes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Doc Chunker running → http://localhost:${PORT}`);
});

export default app;
