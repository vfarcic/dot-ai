/**
 * Nushell Runtime Checker
 *
 * Detects Nushell installation and provides installation guidance.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface NushellVersionInfo {
  installed: boolean;
  version: string | null;
  error?: string;
}

/**
 * Official Nushell installation documentation
 */
const INSTALL_URL = 'https://www.nushell.sh/book/installation.html';

export class NushellRuntime {
  /**
   * Check if Nushell is installed on the system
   */
  async checkInstalled(): Promise<boolean> {
    try {
      await execAsync('nu --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the installed Nushell version
   * Returns null if Nushell is not installed
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('nu --version');
      // Parse version from output like "0.95.0" or "nushell 0.95.0"
      const versionMatch = stdout.trim().match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get comprehensive version information
   */
  async getVersionInfo(): Promise<NushellVersionInfo> {
    const installed = await this.checkInstalled();

    if (!installed) {
      return {
        installed: false,
        version: null,
        error: 'Nushell is not installed'
      };
    }

    const version = await this.getVersion();

    if (!version) {
      return {
        installed: true,
        version: null,
        error: 'Unable to determine Nushell version'
      };
    }

    return {
      installed: true,
      version
    };
  }

  /**
   * Get the official installation documentation URL
   */
  getInstallationUrl(): string {
    return INSTALL_URL;
  }

  /**
   * Validate Nushell installation and return detailed status
   */
  async validateRuntime(): Promise<{
    ready: boolean;
    message: string;
    versionInfo?: NushellVersionInfo;
    installationUrl?: string;
  }> {
    const versionInfo = await this.getVersionInfo();

    if (!versionInfo.installed) {
      return {
        ready: false,
        message: `Nushell is not installed. Please install Nushell from: ${INSTALL_URL}`,
        versionInfo,
        installationUrl: INSTALL_URL
      };
    }

    if (!versionInfo.version) {
      return {
        ready: false,
        message: `Unable to determine Nushell version. Please ensure Nushell is properly installed from: ${INSTALL_URL}`,
        versionInfo,
        installationUrl: INSTALL_URL
      };
    }

    return {
      ready: true,
      message: `Nushell ${versionInfo.version} is ready`,
      versionInfo
    };
  }
}
