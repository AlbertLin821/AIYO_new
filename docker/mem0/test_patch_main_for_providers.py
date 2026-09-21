import os
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import patch_main_for_providers as subject


class AdapterTests(unittest.TestCase):
    def test_client_binding_preserves_requests_with_bounded_timeout_and_configurable_thinking(self):
        class Client:
            def __init__(self, *args, **kwargs):
                self.options = kwargs

            def chat(self, *args, **kwargs):
                return args, kwargs

        adapter = types.ModuleType("mem0.llms.ollama")
        adapter.Client = Client
        llms = types.ModuleType("mem0.llms")
        llms.ollama = adapter
        mem0 = types.ModuleType("mem0")
        mem0.llms = llms
        with patch.dict(sys.modules, {"mem0": mem0, "mem0.llms": llms, "mem0.llms.ollama": adapter}), patch.dict(os.environ, {}, clear=True):
            scope = {"os": os}
            exec(subject.build_ollama_client_adapter(), scope)
            client = adapter.Client(host="http://localhost:11434")
            self.assertEqual(client.options, {"host": "http://localhost:11434", "timeout": 90})
            request = {"model": "qwen3.5:9b", "messages": [], "format": "json", "options": {"num_predict": 2000}}
            self.assertEqual(client.chat(**request)[1], {**request, "think": False})
            os.environ["MEM0_OLLAMA_THINK"] = "true"
            os.environ["MEM0_OLLAMA_TIMEOUT_SECONDS"] = "30"
            self.assertTrue(client.chat(**request)[1]["think"])
            self.assertFalse(client.chat(**request, think=False)[1]["think"])
            self.assertEqual(adapter.Client().options["timeout"], 30)
            for invalid in ["nan", "inf", "500", "-2", "oops"]:
                os.environ["MEM0_OLLAMA_TIMEOUT_SECONDS"] = invalid
                self.assertEqual(adapter.Client().options["timeout"], 90)
            installed = adapter.Client
            exec(subject.build_ollama_client_adapter(), scope)
            self.assertIs(adapter.Client, installed)

    def test_repeated_start_replaces_generated_block_without_duplicate_wrappers(self):
        original = 'import os\nDEFAULT_CONFIG = {}\n\nset_session_factory(SessionLocal)\ninitialize_state(DEFAULT_CONFIG)\n'
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "main.py"
            path.write_text(original, encoding="utf-8")
            with patch.object(subject.pathlib, "Path", return_value=path), patch.dict(os.environ, {"MEM0_DEFAULT_LLM_PROVIDER": "ollama"}):
                subject.main()
                first = path.read_text(encoding="utf-8")
                subject.main()
                self.assertEqual(first, path.read_text(encoding="utf-8"))
                compile(first, "generated-main.py", "exec")
                self.assertEqual(first.count(subject.MARKER), 1)
                self.assertLess(first.index("_install_aiyo_mem0_ollama_client()"), first.index("initialize_state(DEFAULT_CONFIG)"))

    def test_non_ollama_provider_does_not_install_ollama_adapter(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "main.py"
            path.write_text('DEFAULT_CONFIG = {}\nset_session_factory(SessionLocal)\n', encoding="utf-8")
            with patch.object(subject.pathlib, "Path", return_value=path), patch.dict(os.environ, {"MEM0_DEFAULT_LLM_PROVIDER": "openai", "MEM0_DEFAULT_LLM_MODEL": "configured-model"}):
                subject.main()
            generated = path.read_text(encoding="utf-8")
            self.assertNotIn("AiyoMem0OllamaClient", generated)
            self.assertNotIn("mem0.llms.ollama", generated)
            self.assertIn('"provider": \'openai\'', generated)


if __name__ == "__main__":
    unittest.main()
