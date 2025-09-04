#!/usr/bin/env node
/**
 * Updates the Python target version across all project files
 */

const fs = require('fs');
const path = require('path');

function loadConfig() {
  const projectRoot = path.dirname(__dirname);
  const configPath = path.join(projectRoot, 'otf-python.config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveConfig(config) {
  const projectRoot = path.dirname(__dirname);
  const configPath = path.join(projectRoot, 'otf-python.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function updatePythonVersion(newVersion) {
    const projectRoot = path.dirname(__dirname);
    
    // Update otf-python.config.json
    const config = loadConfig();
    config.version = newVersion;
    saveConfig(config);
    console.log(`✓ Updated otf-python.config.json`);
    
    // Update pyproject.toml in integration tests
    const pyprojectFile = path.join(projectRoot, 'integration_test', 'python', 'pyproject.toml');
    if (fs.existsSync(pyprojectFile)) {
        let pyprojectContent = fs.readFileSync(pyprojectFile, 'utf-8');
        pyprojectContent = pyprojectContent.replace(
            /otf-api==[\d.]+/,
            `otf-api==${newVersion}`
        );
        fs.writeFileSync(pyprojectFile, pyprojectContent);
        console.log(`✓ Updated ${pyprojectFile}`);
    }
    
    console.log(`🎉 Python target version updated to ${newVersion}`);
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
    // Read current version from config
    try {
        const config = loadConfig();
        console.log(`Current Python target version: ${config.version}`);
        console.log(`Repository: ${config.repository.owner}/${config.repository.name}`);
        if (config.localOverride?.enabled) {
            console.log(`Local override enabled: ${config.localOverride.path}`);
        }
    } catch (error) {
        console.log('Error reading configuration:', error.message);
    }
} else {
    const newVersion = args[0];
    updatePythonVersion(newVersion);
}