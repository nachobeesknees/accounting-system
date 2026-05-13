"""
JurisdictionRegistry: Dynamic module loading, registration, and activation.

Core engine queries this registry for jurisdiction-specific behavior.
Modules are loaded dynamically; adding a new jurisdiction doesn't require core changes.
"""

from typing import Dict, Optional, List
from .base import LocalizationModule
import importlib
import logging

logger = logging.getLogger(__name__)


class JurisdictionRegistry:
    """
    Singleton registry for localization modules.

    Lazy-loads modules per jurisdiction.
    Core engine never imports country-specific code directly.
    """

    _instance: Optional["JurisdictionRegistry"] = None
    _modules: Dict[str, LocalizationModule] = {}
    _module_paths: Dict[str, str] = {}

    def __new__(cls) -> "JurisdictionRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Register known module paths."""
        # v1: US module
        self._module_paths["US"] = "apps.localization.us_module.module"

        # v2+ skeleton modules
        self._module_paths["UY"] = "apps.localization.uy_module.module"
        self._module_paths["BVI"] = "apps.localization.bvi_module.module"
        self._module_paths["UK"] = "apps.localization.uk_module.module"
        self._module_paths["CH"] = "apps.localization.ch_module.module"
        self._module_paths["HK"] = "apps.localization.hk_module.module"
        self._module_paths["NZ"] = "apps.localization.nz_module.module"
        self._module_paths["UAE"] = "apps.localization.uae_module.module"
        self._module_paths["SG"] = "apps.localization.sg_module.module"
        self._module_paths["ES"] = "apps.localization.es_module.module"
        self._module_paths["IT"] = "apps.localization.it_module.module"

    def register(
        self, country_code: str, module: LocalizationModule, force: bool = False
    ) -> None:
        """
        Register a module (usually called by module on import).

        Args:
            country_code: ISO 3166-1 alpha-2 code
            module: LocalizationModule instance
            force: if True, overwrite existing registration
        """
        if country_code in self._modules and not force:
            raise ValueError(
                f"Module for {country_code} already registered. Use force=True to override."
            )
        self._modules[country_code] = module
        logger.info(f"Registered localization module: {module}")

    def get(self, country_code: str) -> LocalizationModule:
        """
        Get module for a jurisdiction, loading if needed.

        Args:
            country_code: ISO 3166-1 alpha-2 code

        Returns:
            LocalizationModule instance

        Raises:
            ValueError: if jurisdiction not found or module load fails
        """
        # Return cached if already loaded
        if country_code in self._modules:
            return self._modules[country_code]

        # Load dynamically
        if country_code not in self._module_paths:
            raise ValueError(
                f"No localization module found for {country_code}. "
                f"Available: {list(self._module_paths.keys())}"
            )

        module_path = self._module_paths[country_code]
        try:
            mod = importlib.import_module(module_path)
            # Module should register itself on import via register()
            if country_code not in self._modules:
                raise ValueError(
                    f"Module {module_path} did not register itself via registry.register()"
                )
            logger.info(f"Loaded localization module: {country_code}")
            return self._modules[country_code]
        except ImportError as e:
            raise ValueError(
                f"Failed to load localization module for {country_code}: {e}"
            )

    def list_available(self) -> List[str]:
        """Return list of all known jurisdiction codes."""
        return sorted(list(self._module_paths.keys()))

    def list_loaded(self) -> List[str]:
        """Return list of currently loaded jurisdiction codes."""
        return sorted(list(self._modules.keys()))

    def is_loaded(self, country_code: str) -> bool:
        """Check if a jurisdiction module is loaded."""
        return country_code in self._modules

    def unload(self, country_code: str) -> None:
        """Unload a module (primarily for testing)."""
        if country_code in self._modules:
            del self._modules[country_code]
            logger.info(f"Unloaded localization module: {country_code}")

    def reload(self, country_code: str) -> LocalizationModule:
        """Reload a module, forcing fresh import."""
        self.unload(country_code)
        return self.get(country_code)

    def clear_all(self) -> None:
        """Clear all loaded modules (primarily for testing)."""
        self._modules.clear()
        logger.info("Cleared all localization modules")

    def __len__(self) -> int:
        return len(self._module_paths)

    def __repr__(self) -> str:
        loaded = len(self._modules)
        total = len(self._module_paths)
        return f"<JurisdictionRegistry {loaded}/{total} loaded>"


# Singleton instance
registry = JurisdictionRegistry()
