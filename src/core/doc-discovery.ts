/**
 * Documentation File Discovery
 * 
 * Discovers documentation files in a project with configurable patterns
 * and intelligent priority ordering.
 */

import * as path from 'path';
import { glob } from 'glob';

export interface DiscoveredFile {
  path: string;
  name: string;
  priority: number;
  category: 'readme' | 'common' | 'docs' | 'other';
  relativePath: string;
}

export class DocDiscovery {
  private readonly ignoredDirs = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'target',
    'bin',
    'obj',
    '.vscode',
    '.idea',
    'coverage',
    '.nyc_output'
  ];

  /**
   * Get file pattern from CLI args or environment variable
   */
  getFilePattern(args: any): string {
    // Priority: CLI argument > environment variable > default
    if (args.filePattern) {
      return args.filePattern;
    }
    
    if (process.env.DOT_AI_DOC_PATTERN) {
      return process.env.DOT_AI_DOC_PATTERN;
    }
    
    return '**/*.md';
  }

  /**
   * Discover documentation files in the project
   */
  async discoverFiles(baseDir: string = process.cwd(), pattern?: string): Promise<DiscoveredFile[]> {
    const filePattern = pattern || '**/*.md';
    
    try {
      // Use glob to find files matching the pattern
      const files = await glob(filePattern, {
        cwd: baseDir,
        ignore: this.ignoredDirs.map(dir => `${dir}/**`),
        nodir: true,
        dot: false
      });

      // Convert to DiscoveredFile objects
      const discoveredFiles: DiscoveredFile[] = files.map((file: string) => {
        const fullPath = path.join(baseDir, file);
        const relativePath = file;
        const name = path.basename(file);
        
        return {
          path: fullPath,
          name,
          priority: this.calculatePriority(relativePath, name),
          category: this.categorizeFile(relativePath, name),
          relativePath
        };
      });

      // Sort by priority (lower number = higher priority)
      return discoveredFiles.sort((a, b) => a.priority - b.priority);
      
    } catch (error) {
      console.error('Error discovering documentation files:', error);
      return [];
    }
  }

  /**
   * Calculate priority for file ordering
   * Lower numbers = higher priority
   */
  private calculatePriority(relativePath: string, fileName: string): number {
    const lowerPath = relativePath.toLowerCase();
    const lowerName = fileName.toLowerCase();
    
    // README files get highest priority
    if (lowerName.startsWith('readme')) {
      if (lowerName === 'readme.md') return 1;
      return 2;
    }
    
    // Common documentation files
    const commonDocs = [
      'contributing.md',
      'changelog.md',
      'changes.md',
      'getting-started.md',
      'getting_started.md',
      'quickstart.md',
      'installation.md',
      'setup.md',
      'usage.md',
      'api.md',
      'license.md'
    ];
    
    if (commonDocs.includes(lowerName)) {
      return 10 + commonDocs.indexOf(lowerName);
    }
    
    // Files in docs directory
    if (lowerPath.includes('docs/') || lowerPath.includes('doc/') || lowerPath.includes('documentation/')) {
      return 100;
    }
    
    // Root level files
    if (!lowerPath.includes('/')) {
      return 200;
    }
    
    // Everything else
    return 1000;
  }

  /**
   * Categorize file by type
   */
  private categorizeFile(relativePath: string, fileName: string): 'readme' | 'common' | 'docs' | 'other' {
    const lowerPath = relativePath.toLowerCase();
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.startsWith('readme')) {
      return 'readme';
    }
    
    const commonDocs = [
      'contributing.md',
      'changelog.md',
      'changes.md',
      'getting-started.md',
      'getting_started.md',
      'quickstart.md',
      'installation.md',
      'setup.md',
      'usage.md',
      'api.md',
      'license.md'
    ];
    
    if (commonDocs.includes(lowerName)) {
      return 'common';
    }
    
    if (lowerPath.includes('docs/') || lowerPath.includes('doc/') || lowerPath.includes('documentation/')) {
      return 'docs';
    }
    
    return 'other';
  }

  /**
   * Format discovered files for display
   */
  formatForDisplay(files: DiscoveredFile[]): string {
    if (files.length === 0) {
      return 'No documentation files found matching the pattern.';
    }

    const defaultFile = files[0]; // Highest priority file
    
    let output = `Found ${files.length} documentation file${files.length === 1 ? '' : 's'}:\n\n`;
    
    // Group by category
    const categories = {
      readme: files.filter(f => f.category === 'readme'),
      common: files.filter(f => f.category === 'common'),
      docs: files.filter(f => f.category === 'docs'),
      other: files.filter(f => f.category === 'other')
    };

    if (categories.readme.length > 0) {
      output += '**README Files:**\n';
      categories.readme.forEach(file => {
        const isDefault = file === defaultFile ? ' (default)' : '';
        output += `- ${file.relativePath}${isDefault}\n`;
      });
      output += '\n';
    }

    if (categories.common.length > 0) {
      output += '**Common Documentation:**\n';
      categories.common.forEach(file => {
        const isDefault = file === defaultFile ? ' (default)' : '';
        output += `- ${file.relativePath}${isDefault}\n`;
      });
      output += '\n';
    }

    if (categories.docs.length > 0) {
      output += '**Documentation Directory:**\n';
      categories.docs.forEach(file => {
        const isDefault = file === defaultFile ? ' (default)' : '';
        output += `- ${file.relativePath}${isDefault}\n`;
      });
      output += '\n';
    }

    if (categories.other.length > 0) {
      output += '**Other Files:**\n';
      categories.other.forEach(file => {
        const isDefault = file === defaultFile ? ' (default)' : '';
        output += `- ${file.relativePath}${isDefault}\n`;
      });
      output += '\n';
    }

    output += `\nDefault selection: **${defaultFile.relativePath}**\n`;
    output += `\nTo test a specific file, use: \`--file path/to/file.md\``;

    return output;
  }
}