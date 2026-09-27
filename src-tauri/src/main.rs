// Su Windows, in versione definitiva, evita che si apra anche una finestra del terminale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cassa_fiera_lib::run()
}
