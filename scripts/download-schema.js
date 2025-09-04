#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

function loadConfig() {
  // Check for local override first
  const localConfigPath = 'otf-python.config.local.json';
  const defaultConfigPath = 'otf-python.config.json';
  
  let configPath = defaultConfigPath;
  if (fs.existsSync(localConfigPath)) {
    console.log(`Using local config from ${localConfigPath}`);
    configPath = localConfigPath;
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Handle local development mode
  if (config.localOverride?.enabled && config.localOverride?.path) {
    const localSchemaPath = path.join(config.localOverride.path, 'schema', 'openapi.yaml');
    if (fs.existsSync(localSchemaPath)) {
      console.log(`Using local schema from ${localSchemaPath}`);
      return { ...config, useLocal: true, localSchemaPath };
    } else {
      console.warn(`Local override enabled but schema not found at ${localSchemaPath}`);
    }
  }
  
  return config;
}

async function downloadSchema() {
  try {
    const config = loadConfig();
    
    // If using local development mode, copy from local path
    if (config.useLocal) {
      const localDir = path.dirname(config.schema.localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      
      fs.copyFileSync(config.localSchemaPath, config.schema.localPath);
      console.log(`Schema copied from local path to ${config.schema.localPath}`);
      return;
    }
    
    // Otherwise download from GitHub
    const { repository, version, schema } = config;
    console.log(`Downloading schema from ${repository.owner}/${repository.name}@${version}...`);

    let releaseUrl;
    if (version === 'latest') {
      releaseUrl = `https://api.github.com/repos/${repository.owner}/${repository.name}/releases/latest`;
    } else {
      releaseUrl = `https://api.github.com/repos/${repository.owner}/${repository.name}/releases/tags/v${version}`;
    }

    // Get release info
    const releaseData = await fetchJson(releaseUrl);
    
    // Find the schema asset
    const schemaAsset = releaseData.assets.find(a => 
      a.name === path.basename(schema.asset) || a.name === schema.asset
    );
    
    if (!schemaAsset) {
      console.error(`Schema asset "${schema.asset}" not found in release ${version}`);
      console.error('Available assets:', releaseData.assets.map(a => a.name).join(', '));
      process.exit(1);
    }

    // Ensure local directory exists
    const localDir = path.dirname(schema.localPath);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    // Download the schema file
    await downloadFile(schemaAsset.browser_download_url, schema.localPath);
    
    console.log(`Schema downloaded to ${schema.localPath}`);
    
  } catch (error) {
    console.error('Error downloading schema:', error.message);
    process.exit(1);
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'otf-api-ts-schema-downloader',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned ${res.statusCode}: ${data}`));
          return;
        }
        
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, localPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    
    https.get(url, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 302) {
        reject(new Error(`Download failed with status ${res.statusCode}`));
        return;
      }
      
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', reject);
    }).on('error', reject);
  });
}

downloadSchema();