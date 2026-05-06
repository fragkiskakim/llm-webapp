#ifndef DCC_CLASS_DIAGRAM_H
#define DCC_CLASS_DIAGRAM_H

// Data Layer Classes
namespace Data {
    class DatabaseConnection {
    private:
        std::string connectionString;
        int port;
        std::string username;
        std::string password;
    public:
        DatabaseConnection(const std::string& connStr, int p, const std::string& u, const std::string& pw);
        virtual ~DatabaseConnection();
        void connect();
        void disconnect();
    };

    class CoordinateGroupDAO {
    private:
        Data::DatabaseConnection* dbConnection;
    public:
        CoordinateGroupDAO(Data::DatabaseConnection* conn);
        virtual ~CoordinateGroupDAO();
        void save(const std::string& label, float x, float y, float r, float theta);
        void update(int id, const std::string& label, float x, float y, float r, float theta);
        void remove(int id);
        std::vector<std::tuple<int, std::string, float, float, float, float>> findByLabel(const std::string& label);
        std::vector<std::tuple<int, std::string, float, float, float, float>> findAll();
    };

    class CartesianCoordinates {
    private:
        float x;
        float y;
    public:
        CartesianCoordinates(float newX, float newY);
        ~CartesianCoordinates();
        float getX() const;
        float getY() const;
        void setX(float newX);
        void setY(float newY);
    };

    class PolarCoordinates {
    private:
        float r;
        float theta;
    public:
        PolarCoordinates(float newR, float newTheta);
        ~PolarCoordinates();
        float getR() const;
        float getTheta() const;
        void setR(float newR);
        void setTheta(float newTheta);
    };
}

// Business Layer Classes
namespace Business {
    class CoordinateGroupManager {
    private:
        Data::CoordinateGroupDAO* coordinateGroupDAO;
    public:
        CoordinateGroupManager(Data::CoordinateGroupDAO* dao);
        ~CoordinateGroupManager();
        void createGroup(const std::string& label, float x, float y);
        void createGroup(const std::string& label, float r, float theta);
        void updateGroup(int id, const std::string& label, float x, float y);
        void updateGroup(int id, const std::string& label, float r, float theta);
        void deleteGroup(int id);
        std::vector<std::tuple<int, std::string, float, float, float, float>> searchGroups(const std::string& label);
        std::vector<std::tuple<int, std::string, float, float, float, float>> getAllGroups();
    };

    class CoordinateConverter {
    public:
        static std::pair<float, float> cartesianToPolar(float x, float y);
        static std::pair<float, float> polarToCartesian(float r, float theta);
    };

    class DataRetriever {
    private:
        Data::CoordinateGroupDAO* coordinateGroupDAO;
    public:
        DataRetriever(Data::CoordinateGroupDAO* dao);
        ~DataRetriever();
        std::vector<std::tuple<int, std::string, float, float, float, float>> retrieveAllGroups();
        std::vector<std::tuple<int, std::string, float, float, float, float>> retrieveByLabel(const std::string& label);
    };
}

// Presentation Layer Classes
namespace Presentation {
    class MainWindow {
    private:
        Business::CoordinateGroupManager* groupManager;
        Business::DataRetriever* dataRetriever;
        Business::CoordinateConverter* coordinateConverter;
    public:
        MainWindow(Business::CoordinateGroupManager* gm, Business::DataRetriever* dr, Business::CoordinateConverter* cc);
        ~MainWindow();
        void displayAllGroups();
        void displayGroupsByLabel(const std::string& label);
        void showCreatePanel();
        void showModifyPanel();
    };

    class CreateGroupPanel {
    private:
        Business::CoordinateGroupManager* groupManager;
        Business::CoordinateConverter* coordinateConverter;
    public:
        CreateGroupPanel(Business::CoordinateGroupManager* gm, Business::CoordinateConverter* cc);
        ~CreateGroupPanel();
        void createCartesianGroup(const std::string& label, float x, float y);
        void createPolarGroup(const std::string& label, float r, float theta);
    };

    class ModifyGroupPanel {
    private:
        Business::CoordinateGroupManager* groupManager;
        Business::DataRetriever* dataRetriever;
        Business::CoordinateConverter* coordinateConverter;
    public:
        ModifyGroupPanel(Business::CoordinateGroupManager* gm, Business::DataRetriever* dr, Business::CoordinateConverter* cc);
        ~ModifyGroupPanel();
        void updateGroup(int id, const std::string& label, float x, float y);
        void updateGroup(int id, const std::string& label, float r, float theta);
    };

    class SearchPanel {
    private:
        Business::DataRetriever* dataRetriever;
    public:
        SearchPanel(Business::DataRetriever* dr);
        ~SearchPanel();
        std::vector<std::tuple<int, std::string, float, float, float, float>> search(const std::string& label);
        std::vector<std::tuple<int, std::string, float, float, float, float>> viewAll();
    };
}

#endif // DCC_CLASS_DIAGRAM_H