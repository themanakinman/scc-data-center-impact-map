import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

const apiPlugin = () => {
  return {
    name: 'api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'POST' && req.url.includes('/api/save-datacenter')) {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          // ... 
          req.on('end', () => {
            try {
              const newFeature = JSON.parse(body);
              
              // Define path to GeoJSON
              const geojsonPath = path.resolve(__dirname, 'src/data/silicon_valley_data_centers.geojson');
              const geojsonData = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
              
              // Append to FeatureCollection
              geojsonData.features.push(newFeature);
              
              // Save it
              fs.writeFileSync(geojsonPath, JSON.stringify(geojsonData, null, 2));

              console.log("Successfully saved new point. Running python script...");

              // Trigger Python rebuild
              const venvPath = path.resolve(__dirname, '../scripts/venv/bin/activate');
              if (!fs.existsSync(venvPath)) {
                const errorMsg = "Python virtual environment not found. Please run 'npm run setup-python' in the app-ui directory.";
                console.error(errorMsg);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: errorMsg }));
                return;
              }

              const activateCmd = "source ../scripts/venv/bin/activate";
              const pyCmd = "python3 ../scripts/generate_reachability.py";
              
              exec(`${activateCmd} && ${pyCmd}`, { cwd: __dirname }, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Exec error: ${error}`);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, error: error.message }));
                  return;
                }
                console.log(stdout);
                
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              });
            } catch (err) {
              console.error(err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else if (req.method === 'POST' && req.url.includes('/api/delete-datacenter')) {
          let body = '';
          req.on('data', chunk => body += chunk.toString());
          req.on('end', () => {
            try {
              const target = JSON.parse(body);
              const geojsonPath = path.resolve(__dirname, 'src/data/silicon_valley_data_centers.geojson');
              const geojsonData = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

              // Filter out the matching coordinate
              geojsonData.features = geojsonData.features.filter(f => {
                const c = f.geometry.coordinates;
                // Match exact float point representation to delete it within cluster tile tolerance
                return !(Math.abs(c[0] - target.coordinates[0]) < 0.001 && 
                         Math.abs(c[1] - target.coordinates[1]) < 0.001);
              });

              fs.writeFileSync(geojsonPath, JSON.stringify(geojsonData, null, 2));
              console.log("Successfully deleted point. Running python script...");

              const venvPath = path.resolve(__dirname, '../scripts/venv/bin/activate');
              if (!fs.existsSync(venvPath)) {
                const errorMsg = "Python virtual environment not found. Please run 'npm run setup-python' in the app-ui directory.";
                console.error(errorMsg);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: errorMsg }));
                return;
              }

              const activateCmd = "source ../scripts/venv/bin/activate";
              const pyCmd = "python3 ../scripts/generate_reachability.py";
              
              exec(`${activateCmd} && ${pyCmd}`, { cwd: __dirname }, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Exec error: ${error}`);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, error: error.message }));
                  return;
                }
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              });
            } catch(err) {
              console.error(err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else if (req.method === 'GET' && req.url.includes('/api/reachability')) {
            const heatPath = path.resolve(__dirname, 'public/santa_clara_reachability.geojson');
            if (fs.existsSync(heatPath)) {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.statusCode = 200;
                res.end(fs.readFileSync(heatPath));
            } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } else {
          next();
        }
      });
    }
  }
}

export default defineConfig({
  base: '/scc-data-center-impact-map/',
  plugins: [vue(), apiPlugin()],
  server: {
    watch: {
      ignored: [
        '**/public/santa_clara_reachability.geojson',
        '**/src/data/silicon_valley_data_centers.geojson'
      ]
    }
  }
})