import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

express.static.mime.define({ 'application/javascript': ['js', 'mjs'] });

app.get('/lib/meshopt_decoder.module.js', (req, res, next) => {
    const vendoredPath = path.join(publicDir, 'lib', 'meshopt_decoder.module.js');
    const packagePath = path.join(__dirname, 'node_modules', 'meshoptimizer', 'meshopt_decoder.module.js');
    const decoderPath = fs.existsSync(vendoredPath) ? vendoredPath : packagePath;

    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    res.sendFile(decoderPath, (err) => {
        if (err) next(err);
    });
});

app.use(express.static(publicDir, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        }
    }
}));

app.listen(PORT, () => {
    console.log(`Flammen fire demo running on port ${PORT}`);
});
