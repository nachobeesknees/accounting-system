"""
Localization system for multi-jurisdiction accounting.

Each jurisdiction is a pluggable module implementing LocalizationModule.
The core engine has ZERO jurisdiction-specific code.
"""

default_app_config = "localization.apps.LocalizationConfig"
