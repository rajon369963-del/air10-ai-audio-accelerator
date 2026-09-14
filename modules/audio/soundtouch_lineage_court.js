/**
 * ⚡ AIR10 SoundTouch Upstream Lineage & License Verification Court
 * Enforces fail-closed validation of SoundTouch and SoundTouchJS
 * upstream pedigree, LGPL-2.1 redistribution compliance, and WSOLA invariants.
 */

const fs = require('fs');
const path = require('path');

class SoundTouchLineageCourt {
  /**
   * Validate upstream lineage manifest data against strict invariants.
   * @param {Object} lineageData
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static evaluateLineage(lineageData) {
    const errors = [];

    if (!lineageData || typeof lineageData !== 'object') {
      return { valid: false, errors: ['Lineage manifest is missing or non-object'] };
    }

    const lineage = lineageData.upstream_lineage;
    if (!lineage) {
      errors.push('Missing upstream_lineage section');
      return { valid: false, errors };
    }

    // 1. Upstream C++ SoundTouch Invariants
    const stCpp = lineage.soundtouch_cpp;
    if (!stCpp) {
      errors.push('Missing soundtouch_cpp upstream section');
    } else {
      if (stCpp.author !== 'Olli Parviainen') {
        errors.push(`Invalid soundtouch_cpp author: expected 'Olli Parviainen', got '${stCpp.author}'`);
      }
      if (stCpp.spdx_id !== 'LGPL-2.1-only') {
        errors.push(`Invalid soundtouch_cpp SPDX license: expected 'LGPL-2.1-only', got '${stCpp.spdx_id}'`);
      }
      if (!stCpp.upstream_url || (!stCpp.upstream_url.includes('soundtouch') && !stCpp.upstream_url.startsWith('https://'))) {
        errors.push(`Invalid soundtouch_cpp upstream_url: '${stCpp.upstream_url}'`);
      }
      if (!stCpp.algorithm || !stCpp.algorithm.startsWith('WSOLA')) {
        errors.push(`Invalid or missing WSOLA algorithm declaration: got '${stCpp.algorithm}'`);
      }
    }

    // 2. SoundTouchJS Port Invariants
    const stJs = lineage.soundtouchjs;
    if (!stJs) {
      errors.push('Missing soundtouchjs upstream section');
    } else {
      if (stJs.porter !== 'Jakub Fiala') {
        errors.push(`Invalid soundtouchjs porter: expected 'Jakub Fiala', got '${stJs.porter}'`);
      }
      if (stJs.npm_package !== 'soundtouchjs') {
        errors.push(`Invalid npm_package name: expected 'soundtouchjs', got '${stJs.npm_package}'`);
      }
      if (stJs.spdx_id !== 'LGPL-2.1-only') {
        errors.push(`Invalid soundtouchjs SPDX license: expected 'LGPL-2.1-only', got '${stJs.spdx_id}'`);
      }
      if (!stJs.github_repo || !stJs.github_repo.includes('jdf/soundtouchjs')) {
        errors.push(`Invalid soundtouchjs github_repo: '${stJs.github_repo}'`);
      }
    }

    // 3. DSP Redistribution Contract
    const contract = lineageData.dsp_redistribution_contract;
    if (!contract) {
      errors.push('Missing dsp_redistribution_contract section');
    } else {
      if (!contract.lgpl_source_offer || typeof contract.lgpl_source_offer !== 'string' || contract.lgpl_source_offer.length < 10) {
        errors.push('Missing or invalid LGPL source offer statement');
      }
      if (contract.dynamic_linking_compliance !== true) {
        errors.push('dynamic_linking_compliance must be explicitly true');
      }
      if (contract.spdx_conformant !== true) {
        errors.push('spdx_conformant must be true');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate the physical NOTICE file on disk.
   * @param {string} noticeFilePath
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static evaluateNoticeFile(noticeFilePath) {
    const errors = [];
    if (!fs.existsSync(noticeFilePath)) {
      return { valid: false, errors: [`NOTICE file does not exist at ${noticeFilePath}`] };
    }

    const content = fs.readFileSync(noticeFilePath, 'utf-8');
    if (!content.includes('Olli Parviainen')) {
      errors.push("NOTICE missing SoundTouch C++ author 'Olli Parviainen'");
    }
    if (!content.includes('Jakub Fiala')) {
      errors.push("NOTICE missing SoundTouchJS porter 'Jakub Fiala'");
    }
    if (!content.includes('LGPL') || !content.includes('2.1')) {
      errors.push('NOTICE missing LGPL-2.1 license statement');
    }
    if (!content.includes('reverse engineering')) {
      errors.push('NOTICE missing LGPL-2.1 reverse engineering compliance clause');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Run full verification on repository files.
   * @param {string} repoRoot
   * @returns {{ pass: boolean, lineage: Object, notice: Object }}
   */
  static runFullCourt(repoRoot) {
    const lineagePath = path.join(repoRoot, 'LEGAL_LINEAGE.json');
    const noticePath = path.join(repoRoot, 'NOTICE');

    if (!fs.existsSync(lineagePath)) {
      return {
        pass: false,
        lineage: { valid: false, errors: [`LEGAL_LINEAGE.json not found at ${lineagePath}`] },
        notice: { valid: false, errors: [] }
      };
    }

    const lineageData = JSON.parse(fs.readFileSync(lineagePath, 'utf-8'));
    const lineageResult = this.evaluateLineage(lineageData);
    const noticeResult = this.evaluateNoticeFile(noticePath);

    return {
      pass: lineageResult.valid && noticeResult.valid,
      lineage: lineageResult,
      notice: noticeResult
    };
  }
}

module.exports = { SoundTouchLineageCourt };
