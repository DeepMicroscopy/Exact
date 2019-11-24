import plugins
import pkgutil
import importlib
import inspect

from util.slide_server import SlideCache
from plugins.ExactServerPlugin import UpdatePolicy, ViewPolicy, NavigationViewOverlayStatus

class pluginEntry:
    mainClass = None
    commonName = None
    plugin = None
    version = None
    instance = None

    def __str__(self):
        return self.commonName


class PluginFinder:
    pluginList = []
    plugin_name_tag = "proc_"
    supported_base_classes = ["Plugin"]

    def __init__(self, slide_cache: SlideCache):
        self.slide_cache = slide_cache
        self.update_plugin_list(slide_cache)


    @property
    def plugin_list(self):
        return self.pluginList

    def filter_plugins(self, product_name:  str, navigation_view_policy :ViewPolicy = None) -> list:
        filtered_list = [p for p in self.pluginList if p.instance.productName == product_name]
        if navigation_view_policy is not None:
            filtered_list = [p for p in filtered_list if p.instance.getNavigationViewPolicy() == navigation_view_policy]

        return filtered_list


    def update_plugin_list(self, slide_cache: SlideCache):

        exact_server_plugins = {
            name: importlib.import_module(name)
            for finder, name, ispkg
            in sorted(self.iter_namespace(plugins)) if self.plugin_name_tag in name
        }

        for plugin in exact_server_plugins:
            new_plugin = pluginEntry()

            classes = [(name, instance_type) for name, instance_type in
                       inspect.getmembers(exact_server_plugins[plugin], inspect.isclass)
                       if name in self.supported_base_classes]

            for name, instance_type in classes:
                if name == 'Plugin':
                    new_plugin.mainClass = name
                    new_plugin.commonName = instance_type.shortName
                    new_plugin.plugin = instance_type
                    new_plugin.version = instance_type.version
                    new_plugin.instance = instance_type(slide_cache)

                    # check if plugin is already with an older version loaded
                    index = [i for i, e in enumerate(self.pluginList)
                             if e.mainClass == new_plugin.mainClass]
                    if len(index) > 0:
                        self.pluginList[index[0]] = new_plugin
                    else:
                        self.pluginList.append(new_plugin)

    def iter_namespace(self, ns_pkg):
        # Specifying the second argument (prefix) to iter_modules makes the
        # returned name an absolute name instead of a relative one. This allows
        # import_module to work without having to do additional modification to
        # the name.
        return pkgutil.iter_modules(ns_pkg.__path__, ns_pkg.__name__ + ".")


